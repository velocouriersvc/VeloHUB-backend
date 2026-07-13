import { AppDataSource } from "../db/data-source";
import { Wallet } from "../models/wallet";
import { WalletTransaction, TransactionType } from "../models/wallet-transaction";
import { PlatformSettings } from "../models/platform-settings";
import { v4 as uuidv4 } from "uuid";
import { createServiceLogger } from "../utils/logger";
import { currencyForCountry } from "../utils/currency";

const log = createServiceLogger("WalletService");

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
