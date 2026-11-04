import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn, Index } from "typeorm";
import type { ReferralCode } from "./referral-code";

/**
 * Which programme a referral is being paid under.
 *
 * UNDECIDED until the referee does something that qualifies. A plain buyer's
 * first purchase settles it as CUSTOMER; a driver completing a trip or a
 * merchant fulfilling an order settles it as PARTNER, which pays more but
 * requires a run of completions rather than a single one.
 */
export enum ReferralProgram {
    UNDECIDED = "undecided",
    CUSTOMER = "customer",
    PARTNER = "partner",
}

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

    @Column({
        type: "enum",
        enum: ReferralProgram,
        default: ReferralProgram.UNDECIDED,
    })
    program: ReferralProgram;

    /** Qualifying completions by the referee so far. */
    @Column({ type: "integer", default: 0 })
    progress: number;

    /** Completions needed before both sides are paid. 1 for CUSTOMER, N for PARTNER. */
    @Column({ type: "integer", default: 1 })
    requiredProgress: number;

    @CreateDateColumn()
    createdAt: Date;

    @ManyToOne("ReferralCode", (code: any) => code.referralLinks)
    @JoinColumn({ name: "referralCodeString", referencedColumnName: "code" })
    referralCode: ReferralCode;
}
