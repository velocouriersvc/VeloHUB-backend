import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from "typeorm";
import { Wallet } from "./wallet";

export enum TransactionType {
    CREDIT = "credit",
    DEBIT = "debit",
}

@Entity("wallet_transactions")
export class WalletTransaction {
    @PrimaryGeneratedColumn("uuid")
    id: string;

    @Column({ type: "uuid" })
    walletId: string;

    @Column({ type: "enum", enum: TransactionType })
    type: TransactionType;

    @Column({ type: "decimal", precision: 12, scale: 2 })
    amount: number;

    @Column({ type: "decimal", precision: 12, scale: 2 })
    balanceBefore: number;

    @Column({ type: "decimal", precision: 12, scale: 2 })
    balanceAfter: number;

    @Column({ type: "varchar", length: 100, unique: true })
    reference: string;

    @Column({ type: "text" })
    description: string;

    @Column({ type: "jsonb", nullable: true })
    metadata: Record<string, any> | null;

    @CreateDateColumn()
    createdAt: Date;

    @ManyToOne(() => Wallet, (wallet: Wallet) => wallet.transactions, { onDelete: "CASCADE" })
    @JoinColumn({ name: "walletId" })
    wallet: Wallet;
}
