import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn, Index } from "typeorm";
import type { ReferralCode } from "./referral-code";

export enum ReferralStatus {
    PENDING = "pending",
    COMPLETED = "completed",
    EXPIRED = "expired",
    REVOKED = "revoked",
}

@Entity("referral_links")
@Index(["referrerId", "referredId"], { unique: true })
export class ReferralLink {
    @PrimaryGeneratedColumn("uuid")
    id: string;

    @Column({ type: "uuid" })
    referrerId: string;

    @Column({ type: "uuid", unique: true })
    referredId: string;

    @Column({ type: "varchar", length: 20 })
    referralCodeString: string;

    @Column({
        type: "enum",
        enum: ReferralStatus,
        default: ReferralStatus.PENDING,
    })
    status: ReferralStatus;

    @Column({ type: "timestamp", nullable: true })
    completedAt: Date | null;

    @Column({ type: "decimal", precision: 10, scale: 2, default: 0 })
    rewardAmount: number;

    @CreateDateColumn()
    createdAt: Date;

    @ManyToOne("ReferralCode", (code: any) => code.referralLinks)
    @JoinColumn({ name: "referralCodeString", referencedColumnName: "code" })
    referralCode: ReferralCode;
}
