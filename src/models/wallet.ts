import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToOne, JoinColumn, OneToMany } from "typeorm";
import { User } from "./user";
import { WalletTransaction } from "./wallet-transaction";

@Entity("wallets")
export class Wallet {
    @PrimaryGeneratedColumn("uuid")
    id: string;

    @Column({ type: "uuid", unique: true })
    userId: string;

    @Column({ type: "decimal", precision: 12, scale: 2, default: 0 })
    balance: number;

    @Column({ type: "varchar", length: 3, default: "GHS" })
    currency: string;

    // Paystack transfer recipient code for payouts (created from the owner's momo/bank
    // details on first payout and reused for every subsequent transfer).
    @Column({ type: "varchar", nullable: true })
    paystackRecipientCode: string | null;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;

    @OneToOne(() => User, { onDelete: "CASCADE" })
    @JoinColumn({ name: "userId" })
    user: User;

    @OneToMany(() => WalletTransaction, (tx: WalletTransaction) => tx.wallet)
    transactions: WalletTransaction[];
}
