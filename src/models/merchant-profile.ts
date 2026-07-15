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

    @Column({ type: "varchar", length: 255, nullable: true, unique: true })
    @Index()
    slug: string | null;

    @Column({ type: "boolean", default: false })
    isOpen: boolean;

    @Column({ type: "varchar", length: 20, default: "weekly" })
    payoutSchedule: string; // "daily" | "weekly" | "manual"

    @Column({ type: "varchar", length: 100, nullable: true })
    payoutMethod: string | null;

    @Column({ type: "varchar", length: 100, nullable: true })
    payoutAccount: string | null;

    @Column({ type: "decimal", precision: 5, scale: 2, nullable: true })
    commissionRate: number | null; // overrides platform default

    @Column({ type: "decimal", precision: 5, scale: 2, nullable: true })
    serviceFeeRate: number | null; // overrides platform default

    @Column({ type: "decimal", precision: 5, scale: 2, nullable: true })
    pickupFeeRate: number | null; // overrides platform default

    @Column({ type: "boolean", default: false })
    autoAcceptOrders: boolean; // skip manual confirm

    @Column({ type: "boolean", default: true })
    isPublicRatings: boolean; // show customer feedback publicly

    // ── Service delivery settings (professional services vertical) ──
    // In-call: customers come to the provider. Out-call: provider travels.
    // A service profile cannot go live with both switched off.
    @Column({ type: "boolean", default: true })
    inCallEnabled: boolean;

    @Column({ type: "boolean", default: false })
    outCallEnabled: boolean;

    // Max distance (km) the provider travels for out-call jobs. Hard cap 20.
    @Column({ type: "decimal", precision: 5, scale: 2, default: 20 })
    travelDistanceKm: number;

    // Out-call travel fees: flat base + per-km, in the provider's currency.
    @Column({ type: "decimal", precision: 12, scale: 2, default: 0 })
    travelFeeBase: number;

    @Column({ type: "decimal", precision: 12, scale: 2, default: 0 })
    travelFeePerKm: number;

    // Provider's IANA timezone; booking times are shown in this timezone.
    @Column({ type: "varchar", length: 60, default: "Africa/Accra" })
    timezone: string;

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
