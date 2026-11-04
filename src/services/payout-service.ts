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
import { User } from "../models/user";
import { payoutRailFor, isPaystackPayoutCountry, PAYSTACK_PAYOUT_CURRENCIES, PayoutRail } from "../config/payout-rails";
import { currencyForCountry } from "../utils/currency";

const log = createServiceLogger("PayoutService");

async function getGatewayProvider() {
    const { paymentProviderRegistry } = await import("./payment/payment-provider-registry");
    return paymentProviderRegistry.getGatewayProvider();
}

async function getStripeProvider() {
    const { paymentProviderRegistry } = await import("./payment/payment-provider-registry");
    return paymentProviderRegistry.getStripeProvider();
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
    private userRepo = AppDataSource.getRepository(User);

    private profileRepoFor(role: PayoutRole): any {
        return role === "driver" ? this.driverRepo : this.merchantRepo;
    }

    /**
     * The currency a Stripe payout must settle in.
     *
     * createWallet() defaults to Ghana when it is called without a country, so
     * users outside Ghana ended up holding a GHS wallet (53 of them, all with
     * a zero balance). Transferring GHS to a US connected account fails, so the
     * payout currency comes from the user's country instead.
     *
     * A mismatched wallet is corrected only while it is empty. If it ever holds
     * money the balance is in the recorded currency and silently relabelling it
     * would misstate real funds, so that case is logged and left alone.
     */
    private async payoutCurrencyFor(userId: string, country: string | null, wallet: Wallet): Promise<string> {
        const expected = currencyForCountry((country || "").toUpperCase());
        const current = wallet.currency || expected;
        if (current === expected) return current;

        if (Number(wallet.balance) === 0) {
            wallet.currency = expected;
            await this.walletRepo.save(wallet);
            log.info("Corrected empty wallet currency to match country", { userId, country, from: current, to: expected });
            return expected;
        }

        log.warn("Wallet currency does not match the user's country; leaving it alone because it holds a balance", {
            userId, country, walletCurrency: current, expected, balance: wallet.balance,
        });
        return current;
    }

    /** The payout rail for this user, decided by their country. */
    async railFor(userId: string): Promise<{ rail: PayoutRail; country: string | null }> {
        const user = await this.userRepo.findOne({ where: { id: userId } });
        const country = user?.country || null;
        return { rail: payoutRailFor(country), country };
    }

    /**
     * What the app should render on the payout screen.
     *
     * Paystack markets keep the bank/momo picker. Everywhere else returns the
     * Stripe Connect state, because those users have no Paystack bank codes to
     * choose from and previously hit a picker that could not accept them.
     */
    async getPayoutMethod(userId: string, role: PayoutRole) {
        const { rail, country } = await this.railFor(userId);
        let wallet = await this.wallet.getWallet(userId);
        if (!wallet) wallet = await this.wallet.createWallet(userId, (country || "GH").toUpperCase());

        if (rail === "paystack") {
            return {
                rail,
                country,
                currency: wallet.currency || PAYSTACK_PAYOUT_CURRENCIES[(country || "").toUpperCase()] || "GHS",
                bank: await this.getBankDetails(userId, role),
                ready: !!wallet.paystackRecipientCode,
            };
        }

        // Stripe: refresh from Stripe so a finished onboarding is reflected even
        // if the account.updated webhook has not landed yet.
        const status = wallet.stripeConnectAccountId
            ? await this.syncStripeStatus(userId)
            : { payoutsEnabled: false, detailsSubmitted: false, requirementsDue: [] as string[], bankLast4: null };

        return {
            rail,
            country,
            currency: await this.payoutCurrencyFor(userId, country, wallet),
            ready: !!status.payoutsEnabled,
            onboarding: {
                started: !!wallet.stripeConnectAccountId,
                detailsSubmitted: !!status.detailsSubmitted,
                requirementsDue: status.requirementsDue || [],
            },
            bankLast4: status.bankLast4 || null,
        };
    }

    /**
     * Create (once) the connected account and return a hosted onboarding link
     * where the user adds their bank details and completes verification.
     */
    async startStripeOnboarding(userId: string, urls: { returnUrl: string; refreshUrl: string }) {
        const { rail, country } = await this.railFor(userId);
        if (rail !== "stripe") {
            throw new Error("Your country is paid out through bank transfer, not Stripe.");
        }
        const stripe = await getStripeProvider();
        let wallet = await this.wallet.getWallet(userId);
        if (!wallet) wallet = await this.wallet.createWallet(userId, (country || "US").toUpperCase());

        if (!wallet.stripeConnectAccountId) {
            const user = await this.userRepo.findOne({ where: { id: userId } });
            const created = await stripe.createConnectAccount({
                email: user?.email || null,
                country: (country || "US").toUpperCase(),
                userId,
            });
            if (!created.success || !created.accountId) {
                throw new Error(created.message || "Could not start payout setup. Please try again.");
            }
            wallet.stripeConnectAccountId = created.accountId;
            await this.walletRepo.save(wallet);
            log.info("Stripe connected account created", { userId, accountId: created.accountId });
        }

        const link = await stripe.createAccountLink({
            accountId: wallet.stripeConnectAccountId!,
            refreshUrl: urls.refreshUrl,
            returnUrl: urls.returnUrl,
        });
        if (!link.success || !link.url) {
            throw new Error(link.message || "Could not open payout setup. Please try again.");
        }
        return { url: link.url, accountId: wallet.stripeConnectAccountId };
    }

    /** Pull the connected account state and cache payouts_enabled on the wallet. */
    async syncStripeStatus(userId: string) {
        const wallet = await this.wallet.getWallet(userId);
        if (!wallet?.stripeConnectAccountId) {
            return { payoutsEnabled: false, detailsSubmitted: false, requirementsDue: [] as string[], bankLast4: null };
        }
        const stripe = await getStripeProvider();
        const status = await stripe.getConnectAccount(wallet.stripeConnectAccountId);
        if (status.success && wallet.stripePayoutsEnabled !== !!status.payoutsEnabled) {
            wallet.stripePayoutsEnabled = !!status.payoutsEnabled;
            await this.walletRepo.save(wallet);
        }
        return {
            payoutsEnabled: !!status.payoutsEnabled,
            detailsSubmitted: !!status.detailsSubmitted,
            requirementsDue: status.requirementsDue || [],
            bankLast4: status.bankLast4 || null,
        };
    }

    /** Stripe account.updated webhook: keep payouts_enabled in step. */
    async handleConnectAccountUpdated(account: any): Promise<void> {
        const accountId = account?.id;
        if (!accountId) return;
        const wallet = await this.walletRepo.findOne({ where: { stripeConnectAccountId: accountId } });
        if (!wallet) return;
        const enabled = !!account.payouts_enabled;
        if (wallet.stripePayoutsEnabled !== enabled) {
            wallet.stripePayoutsEnabled = enabled;
            await this.walletRepo.save(wallet);
            log.info("Stripe connect payouts flag updated", { accountId, enabled });
        }
    }

    /** Banks / momo providers for the payout picker. */
    async listBanks(currency: string) {
        const provider = await getGatewayProvider();
        if (!provider.listBanks) return [];
        const res = await provider.listBanks(currency);
        return res.banks || [];
    }

    /** Guard: the bank picker is Paystack-only and meaningless elsewhere. */
    private async assertPaystackRail(userId: string) {
        const { rail, country } = await this.railFor(userId);
        if (rail !== "paystack") {
            throw new Error(
                "Bank payouts for your country are set up through Stripe. Open payout setup to add your bank.",
            );
        }
        return country;
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
        // Outside Paystack's markets these codes do not exist; those users go
        // through Stripe Connect onboarding instead.
        await this.assertPaystackRail(userId);
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

        const { rail } = await this.railFor(userId);
        if (rail === "stripe") {
            return this.instantPayoutViaStripe(userId, wallet, amount, input);
        }
        if (!wallet.paystackRecipientCode) throw new Error("Add your bank details before requesting a payout");

        const { fee, net, currency } = payoutBreakdown(amount, wallet.currency || "NGN");
        if (net <= 0) throw new Error("Amount is too small to cover the transfer fee");
        // Payouts may only draw the WITHDRAWABLE balance (excludes non-withdrawable promo/referral credit).
        if (amount > (await this.wallet.getWithdrawableBalance(userId))) {
            throw new Error("Insufficient withdrawable balance for this payout");
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
        }, false, true); // withdrawableOnly: never spend promo credit

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

    /**
     * Payout for countries Paystack cannot reach. Same ledger semantics as the
     * Paystack path: debit the gross up front, send the net, and re-credit
     * immediately if Stripe rejects the transfer.
     */
    private async instantPayoutViaStripe(
        userId: string,
        wallet: Wallet,
        amount: number,
        input: { amount: number; reason?: string; audit?: Record<string, any> },
    ): Promise<{ reference: string; gross: number; fee: number; net: number; status: string }> {
        if (!wallet.stripeConnectAccountId || !wallet.stripePayoutsEnabled) {
            // Re-check with Stripe before refusing: onboarding may have just finished.
            const status = await this.syncStripeStatus(userId);
            if (!status.payoutsEnabled) {
                throw new Error("Finish payout setup before requesting a payout");
            }
        }

        const { country } = await this.railFor(userId);
        const currency = await this.payoutCurrencyFor(userId, country, wallet);
        const { fee, net } = payoutBreakdown(amount, currency);
        if (net <= 0) throw new Error("Amount is too small to cover the transfer fee");
        if (amount > (await this.wallet.getWithdrawableBalance(userId))) {
            throw new Error("Insufficient withdrawable balance for this payout");
        }

        const reference = `PO-${uuidv4().slice(0, 12)}`;
        await this.wallet.debit(userId, amount, `Payout to bank (${currency})`, {
            type: "payout",
            status: "processing",
            rail: "stripe",
            gross: amount,
            fee,
            net,
            reference,
            ...(input.audit || {}),
        }, false, true);

        const stripe = await getStripeProvider();
        const fresh = await this.wallet.getWallet(userId);
        const transfer = await stripe.transferToConnectedAccount({
            accountId: fresh!.stripeConnectAccountId!,
            amount: net,
            currency,
            reference,
            description: input.reason || `On-Demand Payout ${reference}`,
        });

        if (!transfer.success) {
            await this.wallet.credit(userId, amount, `Payout reversed: ${reference}`, {
                type: "payout_reversal",
                ofReference: reference,
                reason: transfer.message || "Transfer could not be started",
            });
            await this.updateTxStatus(reference, "failed", { lastError: transfer.message });
            throw new Error(transfer.message || "Bank transfer could not be started. Please try again later.");
        }

        // Stripe accepts the transfer synchronously, so it is settled from our side.
        await this.updateTxStatus(reference, "success", { stripeTransferId: transfer.transferId });
        log.info("Instant payout sent via Stripe", { userId, reference, gross: amount, fee, net });
        return { reference, gross: amount, fee, net, status: "success" };
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
