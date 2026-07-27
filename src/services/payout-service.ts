import { AppDataSource } from "../db/data-source";
import { WalletService } from "./wallet-service";
import { WalletTransaction } from "../models/wallet-transaction";
import { Wallet } from "../models/wallet";
import { DriverProfile } from "../models/driver-profile";
import { MerchantProfile } from "../models/merchant-profile";
import { NotificationService } from "./notification-service";
import { NotificationType } from "../models/notification";
import { v4 as uuidv4 } from "uuid";
import { createServiceLogger } from "../utils/logger";
import { payoutBreakdown } from "../utils/payout-fee";

const log = createServiceLogger("PayoutService");

async function getGatewayProvider() {
    const { paymentProviderRegistry } = await import("./payment/payment-provider-registry");
    return paymentProviderRegistry.getGatewayProvider();
}

export type PayoutRole = "driver" | "merchant";

const maskAccount = (n?: string | null) => (n && n.length > 4 ? `****${n.slice(-4)}` : n || null);

/**
 * On-demand payouts (Paystack Transfers), fully automated (Option 2): a request fires
 * the transfer immediately. Bank details are resolved + turned into a Paystack recipient
 * up front; the fee is shown transparently; a failed/reversed transfer re-credits the
 * wallet via the webhook handler.
 */
export class PayoutService {
    private wallet = new WalletService();
    private txRepo = AppDataSource.getRepository(WalletTransaction);
    private walletRepo = AppDataSource.getRepository(Wallet);
    private driverRepo = AppDataSource.getRepository(DriverProfile);
    private merchantRepo = AppDataSource.getRepository(MerchantProfile);
    private notifications = new NotificationService();

    private profileRepoFor(role: PayoutRole): any {
        return role === "driver" ? this.driverRepo : this.merchantRepo;
    }

    /** Banks / momo providers for the payout picker. */
    async listBanks(currency: string) {
        const provider = await getGatewayProvider();
        if (!provider.listBanks) return [];
        const res = await provider.listBanks(currency);
        return res.banks || [];
    }

    /** The saved payout destination (account number masked). */
    async getBankDetails(userId: string, role: PayoutRole) {
        const profile: any = await this.profileRepoFor(role).findOne({ where: { userId } });
        if (!profile || !profile.bankCode) return null;
        return {
            bankCode: profile.bankCode,
            bankName: profile.bankName,
            accountName: profile.accountName,
            accountNumber: maskAccount(profile.accountNumber),
            verified: !!profile.bankVerified,
        };
    }

    /** Fee/net breakdown for a requested gross amount. */
    async quote(userId: string, amount: number) {
        const wallet = await this.wallet.getWallet(userId);
        return payoutBreakdown(amount, wallet?.currency || "NGN");
    }

    /**
     * Resolve the account (fraud check), create the Paystack transfer recipient, and
     * persist the bank details. Overwrites any previous recipient (details may change).
     */
    async saveBankDetails(
        userId: string,
        role: PayoutRole,
        input: { bankCode: string; accountNumber: string; bankName?: string; isMomo?: boolean }
    ) {
        if (!input.bankCode || !input.accountNumber) throw new Error("Bank and account number are required");
        const provider = await getGatewayProvider();
        if (!provider.resolveAccount || !provider.createTransferRecipient) {
            throw new Error("Payouts are not available right now");
        }
        let wallet = await this.wallet.getWallet(userId);
        if (!wallet) wallet = await this.wallet.createWallet(userId);
        const currency = wallet.currency || "NGN";

        const resolved = await provider.resolveAccount(input.accountNumber, input.bankCode);
        if (!resolved.success || !resolved.accountName) {
            throw new Error(resolved.message || "Could not verify this account. Check the number and bank.");
        }

        const recipient = await provider.createTransferRecipient({
            type: input.isMomo ? "mobile_money" : "nuban",
            name: resolved.accountName,
            account_number: input.accountNumber,
            bank_code: input.bankCode,
            currency,
        });
        if (!recipient.success || !recipient.recipientCode) {
            throw new Error(recipient.message || "Could not save this account for payouts.");
        }

        const profile: any = await this.profileRepoFor(role).findOne({ where: { userId } });
        if (!profile) throw new Error("Profile not found");
        profile.bankCode = input.bankCode;
        profile.accountNumber = input.accountNumber;
        profile.accountName = resolved.accountName;
        profile.bankName = input.bankName || profile.bankName || null;
        profile.bankVerified = true;
        await this.profileRepoFor(role).save(profile);

        await this.wallet.setRecipientCode(userId, recipient.recipientCode);

        log.info("Payout bank details saved", { userId, role, bankCode: input.bankCode });
        return { accountName: resolved.accountName, bankName: profile.bankName, accountNumber: maskAccount(input.accountNumber) };
    }

    /**
     * Fire an on-demand payout NOW (Option 2). Debits the gross from the wallet, sends
     * (gross - fee) to the recipient, and records an itemized ledger entry. If the
     * transfer is rejected synchronously the wallet is re-credited before throwing.
     * Guards (daily limit, active trip, OTP, role) are enforced by the caller.
     */
    async instantPayout(
        userId: string,
        input: { amount: number; reason?: string; audit?: Record<string, any> }
    ): Promise<{ reference: string; gross: number; fee: number; net: number; status: string }> {
        const amount = Number(input.amount);
        if (!amount || amount <= 0) throw new Error("Amount must be greater than 0");

        const wallet = await this.wallet.getWallet(userId);
        if (!wallet) throw new Error("Wallet not found");
        if (!wallet.paystackRecipientCode) throw new Error("Add your bank details before requesting a payout");

        const { fee, net, currency } = payoutBreakdown(amount, wallet.currency || "NGN");
        if (net <= 0) throw new Error("Amount is too small to cover the transfer fee");
        if (!(await this.wallet.hasEnoughBalance(userId, amount))) {
            throw new Error("Insufficient wallet balance for this payout");
        }

        const reference = `PO-${uuidv4().slice(0, 12)}`;
        await this.wallet.debit(userId, amount, `Payout to bank (${currency})`, {
            type: "payout",
            status: "processing",
            gross: amount,
            fee,
            net,
            reference,
            paystackTransferFee: fee,
            ...(input.audit || {}),
        });

        const transfer = await this.wallet.initiatePayoutTransfer(userId, {
            amount: net,
            reference,
            reason: input.reason || `On-Demand Payout ${reference}`,
        });

        if (!transfer.success) {
            // Synchronous rejection: return the funds immediately so nothing is stranded.
            await this.wallet.credit(userId, amount, `Payout reversed: ${reference}`, {
                type: "payout_reversal",
                ofReference: reference,
                reason: transfer.message || "Transfer could not be started",
            });
            await this.updateTxStatus(reference, "failed", { lastError: transfer.message });
            throw new Error(transfer.message || "Bank transfer could not be started. Please try again later.");
        }

        log.info("Instant payout sent", { userId, reference, gross: amount, fee, net });
        return { reference, gross: amount, fee, net, status: "processing" };
    }

    /** Count today's payout requests for a user (daily-limit guard). */
    async payoutsToday(userId: string): Promise<number> {
        const wallet = await this.wallet.getWallet(userId);
        if (!wallet) return 0;
        const start = new Date();
        start.setHours(0, 0, 0, 0);
        const rows = await this.txRepo
            .createQueryBuilder("t")
            .where("t.walletId = :walletId", { walletId: wallet.id })
            .andWhere("t.metadata->>'type' = :type", { type: "payout" })
            .andWhere("t.createdAt >= :start", { start })
            .getCount();
        return rows;
    }

    /** Update a payout ledger row's status by our transfer reference. */
    private async updateTxStatus(reference: string, status: string, extra?: Record<string, any>): Promise<WalletTransaction | null> {
        const tx = await this.txRepo
            .createQueryBuilder("t")
            .where("t.metadata->>'reference' = :reference", { reference })
            .andWhere("t.metadata->>'type' = :type", { type: "payout" })
            .getOne();
        if (!tx) return null;
        tx.metadata = { ...(tx.metadata || {}), status, ...(extra || {}) };
        return this.txRepo.save(tx);
    }

    /**
     * Paystack transfer.* webhook. transfer.success finalizes the payout;
     * transfer.failed / transfer.reversed re-credit the full gross to the wallet
     * (idempotently) and notify the user.
     */
    async handleTransferWebhook(event: string, data: any): Promise<void> {
        const reference = data?.reference;
        if (!reference) return;
        const tx = await this.txRepo
            .createQueryBuilder("t")
            .where("t.metadata->>'reference' = :reference", { reference })
            .andWhere("t.metadata->>'type' = :type", { type: "payout" })
            .getOne();
        if (!tx) {
            log.warn("Transfer webhook for unknown payout reference", { reference, event });
            return;
        }
        const status = String(tx.metadata?.status || "");

        if (event === "transfer.success") {
            if (status !== "completed") await this.updateTxStatus(reference, "completed");
            return;
        }

        if (event === "transfer.failed" || event === "transfer.reversed") {
            if (status === "reversed") return; // already refunded (idempotent)
            const wallet = await this.walletRepo.findOne({ where: { id: tx.walletId } });
            if (!wallet) return;
            const gross = Number(tx.metadata?.gross ?? tx.amount);
            await this.wallet.credit(wallet.userId, gross, `Payout reversed: ${reference}`, {
                type: "payout_reversal",
                ofReference: reference,
                reason: event,
            });
            await this.updateTxStatus(reference, "reversed", { reversedBy: event });
            await this.notifications
                .notify(
                    wallet.userId,
                    NotificationType.WALLET_CREDITED,
                    "Payout returned",
                    "Your payout could not be completed (bank network issue) and the funds have been returned to your wallet. Please try again later.",
                    { reference }
                )
                .catch(() => {});
            log.info("Payout reversed, wallet re-credited", { reference, userId: wallet.userId, gross });
        }
    }
}
