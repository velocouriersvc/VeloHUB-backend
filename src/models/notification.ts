import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from "typeorm";
import { User } from "./user";

export enum NotificationType {
    // Ride notifications
    RIDE_REQUESTED = "ride_requested",
    RIDE_ACCEPTED = "ride_accepted",
    RIDE_CANCELLED = "ride_cancelled",
    DRIVER_ENROUTE = "driver_enroute",
    DRIVER_ARRIVED = "driver_arrived",
    RIDE_STARTED = "ride_started",
    RIDE_COMPLETED = "ride_completed",

    // Payment notifications
    PAYMENT_RECEIVED = "payment_received",
    PAYMENT_FAILED = "payment_failed",
    WALLET_CREDITED = "wallet_credited",
    WALLET_DEBITED = "wallet_debited",
    COMMISSION_DEDUCTED = "commission_deducted",

    // Rating
    NEW_RATING = "new_rating",

    // Account
    ROLE_APPROVED = "role_approved",
    ROLE_REJECTED = "role_rejected",
    PROMO_CODE = "promo_code",

    // General
    SYSTEM = "system",
}

@Entity("notifications")
export class Notification {
    @PrimaryGeneratedColumn("uuid")
    id: string;

    @Column({ type: "uuid" })
    userId: string;

    @Column({ type: "enum", enum: NotificationType })
    type: NotificationType;

    @Column({ type: "varchar", length: 255 })
    title: string;

    @Column({ type: "text" })
    body: string;

    @Column({ type: "jsonb", nullable: true })
    data: Record<string, any> | null;

    @Column({ type: "boolean", default: false })
    isRead: boolean;

    @CreateDateColumn()
    createdAt: Date;

    @ManyToOne(() => User, { onDelete: "CASCADE" })
    @JoinColumn({ name: "userId" })
    user: User;
}
