import { Entity, PrimaryGeneratedColumn, Column, OneToOne, JoinColumn, CreateDateColumn, UpdateDateColumn, ManyToOne, Index } from "typeorm";
import { User } from "./user";
import { Identification } from "./identification";

export enum MerchantVerificationStatus {
    PENDING = "pending",
    APPROVED = "approved",
    REJECTED = "rejected",
}

@Entity("merchant_profiles")
export class MerchantProfile {
    @PrimaryGeneratedColumn("uuid")
    id: string;

    @Column({ type: "uuid" })
    userId: string;

    @Column({ type: "varchar", length: 255 })
    businessName: string;

    @Column({ type: "varchar", length: 100 })
    category: string;

    @Column({ type: "varchar", length: 255, nullable: true })
    businessEmail: string | null;

    @Column({ type: "varchar", length: 20, nullable: true })
    businessPhone: string | null;

    @Column({ type: "text" })
    address: string;

    @Column({ type: "double precision", nullable: true })
    latitude: number | null;

    @Column({ type: "double precision", nullable: true })
    longitude: number | null;

    @Column({ type: "varchar", length: 100, nullable: true })
    region: string | null;

    @Column({ type: "text", nullable: true })
    registrationDocUrl: string | null;

    @Column({
        type: "enum",
        enum: MerchantVerificationStatus,
        default: MerchantVerificationStatus.PENDING,
    })
    status: MerchantVerificationStatus;

    // ── Marketplace Fields ──
    @Column({ type: "text", nullable: true })
    description: string | null;

    @Column({ type: "text", nullable: true })
    coverImageUrl: string | null;

    @Column({ type: "boolean", default: false })
    isOpen: boolean;

    @Column({ type: "decimal", precision: 5, scale: 2, nullable: true })
    commissionRate: number | null; // overrides platform default

    @Column({ type: "decimal", precision: 5, scale: 2, nullable: true })
    serviceFeeRate: number | null; // overrides platform default

    @Column({ type: "decimal", precision: 5, scale: 2, nullable: true })
    pickupFeeRate: number | null; // overrides platform default

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;

    @Column({ type: "uuid", nullable: true })
    identificationId: string | null;

    @OneToOne(() => User, (user: User) => user.merchantProfile, { onDelete: "CASCADE" })
    @JoinColumn({ name: "userId" })
    user: User;

    @ManyToOne(() => Identification, { nullable: true })
    @JoinColumn({ name: "identificationId" })
    identification: Identification | null;
}
