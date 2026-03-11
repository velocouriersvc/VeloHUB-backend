import { AppDataSource } from "../db/data-source";
import { Wallet } from "../models/wallet";
import { WalletTransaction, TransactionType } from "../models/wallet-transaction";
import { v4 as uuidv4 } from "uuid";
import { createServiceLogger } from "../utils/logger";

const log = createServiceLogger("WalletService");

export class WalletService {
    private walletRepo = AppDataSource.getRepository(Wallet);
    private txRepo = AppDataSource.getRepository(WalletTransaction);

    /**
     * Create a wallet for a user (called on signup)
     */
    async createWallet(userId: string): Promise<Wallet> {
        const existing = await this.walletRepo.findOne({ where: { userId } });
        if (existing) return existing;

        const wallet = this.walletRepo.create({ userId, balance: 0, currency: "GHS" });
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
     * Debit wallet (remove funds)
     */
    async debit(
        userId: string,
        amount: number,
        description: string,
        metadata?: Record<string, any>
    ): Promise<WalletTransaction> {
        if (amount <= 0) throw new Error("Debit amount must be positive");

        const wallet = await this.walletRepo.findOne({ where: { userId } });
        if (!wallet) throw new Error("Wallet not found");

        const balanceBefore = Number(wallet.balance);
        if (balanceBefore < amount) {
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
