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

    // Order notifications
    ORDER_PLACED = "order_placed",
    ORDER_ACCEPTED = "order_accepted",
    ORDER_REJECTED = "order_rejected",
    ORDER_PREPARING = "order_preparing",
    ORDER_READY = "order_ready",
    ORDER_PICKED_UP = "order_picked_up",
    ORDER_IN_TRANSIT = "order_in_transit",
    ORDER_DELIVERED = "order_delivered",
    ORDER_COMPLETED = "order_completed",
    ORDER_CANCELLED = "order_cancelled",

    // Pickup
    PICKUP_CODE_GENERATED = "pickup_code_generated",
    PICKUP_CODE_VERIFIED = "pickup_code_verified",

    // Merchant
    NEW_PRODUCT_REVIEW = "new_product_review",
    PAYOUT_REQUESTED = "payout_requested",
    PAYOUT_COMPLETED = "payout_completed",
    MERCHANT_APPROVED = "merchant_approved",
    MERCHANT_SUSPENDED = "merchant_suspended",

    // General
    SYSTEM = "system",
    GENERAL_ANNOUNCEMENT = "general_announcement",

    // Services
    SERVICE_REQUESTED = "service_requested",
    SERVICE_ACCEPTED = "service_accepted",
    SERVICE_DECLINED = "service_declined",
    SERVICE_SCHEDULED = "service_scheduled",
    SERVICE_STARTED = "service_started",
    SERVICE_COMPLETED = "service_completed",
    SERVICE_CANCELLED = "service_cancelled",
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
