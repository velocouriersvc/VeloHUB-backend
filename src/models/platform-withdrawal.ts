import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from "typeorm";

@Entity("platform_withdrawals")
export class PlatformWithdrawal {
    @PrimaryGeneratedColumn("uuid")
    id: string;

    @Column("decimal", { precision: 12, scale: 2 })
    amount: number;

    @Column()
    withdrawal_method: string;

    @Column("text")
    account_details: string;

    @Column({ default: "pending" })
    status: string;

    @Column({ nullable: true })
    notes: string;

    @Column({ nullable: true })
    period_start: string;

    @Column({ nullable: true })
    period_end: string;

    @Column({ nullable: true })
    country: string;

    @Column({ nullable: true })
    city: string;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}
