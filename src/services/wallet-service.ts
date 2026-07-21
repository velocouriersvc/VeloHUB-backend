import { AppDataSource } from "../db/data-source";
import { Wallet } from "../models/wallet";
import { WalletTransaction, TransactionType } from "../models/wallet-transaction";
import { PlatformSettings } from "../models/platform-settings";
import { v4 as uuidv4 } from "uuid";
import { createServiceLogger } from "../utils/logger";
import { currencyForCountry } from "../utils/currency";
import { paymentProviderRegistry } from "./payment/payment-provider-registry";

const log = createServiceLogger("WalletService");

// Ghana mobile-money providers map to Paystack "mobile_money" bank codes; anything
// else is treated as a bank account (nuban), with payoutMethod carrying the bank code.
const MOMO_BANK_CODES: Record<string, string> = {
    mtn: "MTN", "mtn momo": "MTN", momo: "MTN",
    vodafone: "VOD", telecel: "VOD", "vodafone cash": "VOD",
    airteltigo: "ATL", airtel: "ATL", tigo: "ATL", "airtel tigo": "ATL",
};

export class WalletService {
    private walletRepo = AppDataSource.getRepository(Wallet);
    private txRepo = AppDataSource.getRepository(WalletTransaction);
    private settingsRepo = AppDataSource.getRepository(PlatformSettings);

    /**
     * Create a wallet for a user (called on signup).
     * Resolves currency from platform_settings based on the user's country.
     */
    async createWallet(userId: string, country: string = "GH"): Promise<Wallet> {
        const existing = await this.walletRepo.findOne({ where: { userId } });
        if (existing) return existing;

        // Try to resolve currency from platform_settings, fall back to static map
        let currency: string;
        const settings = await this.settingsRepo.findOne({
            where: { country, isActive: true },
        });
        currency = settings?.currency || currencyForCountry(country);

        const wallet = this.walletRepo.create({ userId, balance: 0, currency });
        return this.walletRepo.save(wallet);
    }

    /**
     * Get wallet by user ID
     */
    async getWallet(userId: string): Promise<Wallet | null> {
        return this.walletRepo.findOne({ where: { userId } });
    }

    /**
     * Ensure a Paystack transfer recipient exists for this wallet's payout account,
     * creating one from the momo/bank details on first use and caching the code on the
     * wallet. Returns the recipient code, or null if creation is unavailable/failed
     * (the caller keeps the payout pending for a later retry rather than throwing).
     */
    async ensurePayoutRecipient(
        userId: string,
        input: { payoutMethod: string; accountNumber: string; accountName: string }
    ): Promise<string | null> {
        const wallet = await this.getWallet(userId);
        if (!wallet) return null;
        if (wallet.paystackRecipientCode) return wallet.paystackRecipientCode;

        const provider = paymentProviderRegistry.getGatewayProvider();
        if (!provider.createTransferRecipient) return null;

        const key = String(input.payoutMethod || "").toLowerCase().trim();
        const momoBank = MOMO_BANK_CODES[key];
        const res = await provider.createTransferRecipient({
            type: momoBank ? "mobile_money" : "nuban",
            name: input.accountName || "Velo Payout",
            account_number: input.accountNumber,
            bank_code: momoBank || input.payoutMethod,
            currency: wallet.currency || "GHS",
        });
        if (!res.success || !res.recipientCode) {
            log.warn("Payout recipient creation failed", { userId, message: res.message });
            return null;
        }
        wallet.paystackRecipientCode = res.recipientCode;
        await this.walletRepo.save(wallet);
        return res.recipientCode;
    }

    /**
     * Send a payout from the Paystack balance to this wallet's stored recipient.
     * Returns success plus any provider message. Does not touch the local wallet
     * balance (that was already debited when the payout was requested).
     */
    async initiatePayoutTransfer(
        userId: string,
        input: { amount: number; reference: string; reason: string }
    ): Promise<{ success: boolean; message?: string; status?: string }> {
        const wallet = await this.getWallet(userId);
        if (!wallet?.paystackRecipientCode) {
            return { success: false, message: "No payout recipient on file" };
        }
        const provider = paymentProviderRegistry.getGatewayProvider();
        if (!provider.initiateTransfer) {
            return { success: false, message: "Transfers not supported by provider" };
        }
        const res = await provider.initiateTransfer({
            amount: input.amount,
            recipient: wallet.paystackRecipientCode,
            currency: wallet.currency || "GHS",
            reason: input.reason,
            reference: input.reference,
        });
        return { success: res.success, message: res.message, status: res.status };
    }

    /**
     * Request a wallet payout (shared by drivers and merchants). Validates and debits
     * the wallet, then creates/reuses the Paystack transfer recipient. The disbursement
     * itself happens on admin approval. Returns the payout transaction reference.
     */
    async requestPayout(
        userId: string,
        input: { amount: number; payoutMethod: string; accountNumber: string; accountName?: string }
    ): Promise<{ success: boolean; reference: string }> {
        const { amount, payoutMethod, accountNumber } = input;
        if (!amount || amount <= 0) throw new Error("Amount must be greater than 0");
        if (!payoutMethod) throw new Error("Payout method is required");
        if (!accountNumber) throw new Error("Account number is required");

        const hasBalance = await this.hasEnoughBalance(userId, amount);
        if (!hasBalance) throw new Error("Insufficient wallet balance for this payout");

        const tx = await this.debit(
            userId,
            amount,
            `Payout request: ${payoutMethod} to ${accountNumber}`,
            { type: "payout", payoutMethod, accountNumber, status: "pending" }
        );

        try {
            await this.ensurePayoutRecipient(userId, {
                payoutMethod,
                accountNumber,
                accountName: input.accountName || "Velo Payout",
            });
        } catch (err) {
            log.warn("Payout recipient setup failed (payout stays pending)", { userId, error: (err as Error).message });
        }

        log.info("Payout requested", { userId, amount, payoutMethod, reference: tx.reference });
        return { success: true, reference: tx.reference };
    }

    /**
     * Get wallet balance
     */
    async getBalance(userId: string): Promise<number> {
        const wallet = await this.walletRepo.findOne({ where: { userId } });
        if (!wallet) throw new Error("Wallet not found");
        return Number(wallet.balance);
    }

    /**
     * Credit wallet (add funds)
     */
    async credit(
        userId: string,
        amount: number,
        description: string,
        metadata?: Record<string, any>
    ): Promise<WalletTransaction> {
        if (amount <= 0) throw new Error("Credit amount must be positive");

        const wallet = await this.walletRepo.findOne({ where: { userId } });
        if (!wallet) throw new Error("Wallet not found");

        const balanceBefore = Number(wallet.balance);
        const balanceAfter = balanceBefore + amount;

        // Update wallet balance
        wallet.balance = balanceAfter;
        await this.walletRepo.save(wallet);

        // Log transaction
        const tx = this.txRepo.create({
            walletId: wallet.id,
            type: TransactionType.CREDIT,
            amount,
            balanceBefore,
            balanceAfter,
            reference: `CR-${uuidv4().slice(0, 12)}`,
            description,
            metadata: metadata || null,
        });

        log.info("Wallet credited", { userId, amount, balanceAfter });
        return this.txRepo.save(tx);
    }

    /**
     * Debit wallet (remove funds). `allowNegative` lets the balance go below zero -
     * used for cash-ride commission collection where the driver holds the fare and
     * OWES the platform (reconciled at their next top-up/cash-out).
     */
    async debit(
        userId: string,
        amount: number,
        description: string,
        metadata?: Record<string, any>,
        allowNegative: boolean = false
    ): Promise<WalletTransaction> {
        if (amount <= 0) throw new Error("Debit amount must be positive");

        const wallet = await this.walletRepo.findOne({ where: { userId } });
        if (!wallet) throw new Error("Wallet not found");

        const balanceBefore = Number(wallet.balance);
        if (!allowNegative && balanceBefore < amount) {
            throw new Error("Insufficient wallet balance");
        }

        const balanceAfter = balanceBefore - amount;

        // Update wallet balance
        wallet.balance = balanceAfter;
        await this.walletRepo.save(wallet);

        // Log transaction
        const tx = this.txRepo.create({
            walletId: wallet.id,
            type: TransactionType.DEBIT,
            amount,
            balanceBefore,
            balanceAfter,
            reference: `DB-${uuidv4().slice(0, 12)}`,
            description,
            metadata: metadata || null,
        });

        log.info("Wallet debited", { userId, amount, balanceAfter });
        return this.txRepo.save(tx);
    }

    /**
     * Get transaction history for a user
     */
    async getTransactions(
        userId: string,
        limit: number = 20,
        offset: number = 0
    ): Promise<{ transactions: WalletTransaction[]; total: number }> {
        const wallet = await this.walletRepo.findOne({ where: { userId } });
        if (!wallet) throw new Error("Wallet not found");

        const [transactions, total] = await this.txRepo.findAndCount({
            where: { walletId: wallet.id },
            order: { createdAt: "DESC" },
            take: limit,
            skip: offset,
        });

        return { transactions, total };
    }

    /**
     * Check if user has enough balance for a payment
     */
    async hasEnoughBalance(userId: string, amount: number): Promise<boolean> {
        const balance = await this.getBalance(userId);
        return balance >= amount;
    }
}
