import { Entity, PrimaryGeneratedColumn, Column, OneToOne, JoinColumn, CreateDateColumn, UpdateDateColumn, ManyToOne } from "typeorm";
import { User } from "./user";
import { Identification } from "./identification";

export enum DriverVerificationStatus {
    PENDING = "pending",
    APPROVED = "approved",
    REJECTED = "rejected",
}

@Entity("driver_profiles")
export class DriverProfile {
    @PrimaryGeneratedColumn("uuid")
    id: string;

    @Column({ type: "uuid" })
    userId: string;

    @Column({ type: "varchar", length: 255 })
    fullName: string;

    // Driver's portrait, shown to customers on the ride tracking card.
    @Column({ type: "text", nullable: true })
    photoUrl: string | null;

    @Column({ type: "varchar", length: 100 })
    licenseNumber: string;

    @Column({ type: "text", nullable: true })
    licensePhotoUrl: string | null;

    @Column({ type: "varchar", length: 50 })
    vehicleType: string;

    @Column({ type: "varchar", length: 50, nullable: true })
    plateNumber: string | null;

    @Column({ type: "varchar", length: 100, nullable: true })
    region: string | null;

    // Operating base location, auto-detected at signup (no manual region needed).
    @Column({ type: "double precision", nullable: true })
    latitude: number | null;

    @Column({ type: "double precision", nullable: true })
    longitude: number | null;

    @Column({ type: "varchar", length: 50, nullable: true })
    vehicleColor: string | null;

    @Column({ type: "varchar", length: 100, nullable: true })
    vehicleModel: string | null;

    @Column({
        type: "enum",
        enum: DriverVerificationStatus,
        default: DriverVerificationStatus.PENDING,
    })
    status: DriverVerificationStatus;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;

    @Column({ type: "uuid", nullable: true })
    identificationId: string | null;

    // ── Off-boarding flag ──
    // Set when a driver cancels after pickup or a delivery is disputed. If not
    // cleared by an admin within 6 hours, the account is auto-suspended.
    @Column({ type: "timestamp", nullable: true })
    flaggedAt: Date | null;

    @Column({ type: "varchar", length: 255, nullable: true })
    flagReason: string | null;

    // ── Payout bank details (Paystack transfer recipient) ──
    @Column({ type: "varchar", length: 20, nullable: true })
    bankCode: string | null;

    @Column({ type: "varchar", length: 50, nullable: true })
    accountNumber: string | null;

    @Column({ type: "varchar", length: 150, nullable: true })
    accountName: string | null;

    @Column({ type: "varchar", length: 150, nullable: true })
    bankName: string | null;

    @Column({ type: "boolean", default: false })
    bankVerified: boolean;

    // Acceptance-rate tracking: incremented each time a ride/delivery is offered
    // (broadcast) to this driver, and each time they accept one. rate = accepted/offered.
    @Column({ type: "int", default: 0 })
    ridesOffered: number;

    @Column({ type: "int", default: 0 })
    ridesAccepted: number;

    @OneToOne(() => User, (user: User) => user.driverProfile, { onDelete: "CASCADE" })
    @JoinColumn({ name: "userId" })
    user: User;

    @ManyToOne(() => Identification, { nullable: true })
    @JoinColumn({ name: "identificationId" })
    identification: Identification | null;
}
