import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn, Index } from "typeorm";
import { User } from "./user";
import { Product } from "./product";

export enum ServiceBookingStatus {
    REQUESTED = "requested",
    ACCEPTED = "accepted",
    DECLINED = "declined",
    SCHEDULED = "scheduled",
    IN_PROGRESS = "in_progress",
    COMPLETED = "completed",
    CANCELLED = "cancelled",
    // Auto-expired: provider never accepted before the 2h pre-appointment cutoff.
    EXPIRED = "expired",
    // Customer cancelled (full refund >3h before start; 70% penalty within 3h).
    CUSTOMER_CANCELLED = "customer_cancelled",
    // Provider cancelled an accepted booking: customer always gets a full refund.
    PROVIDER_CANCELLED = "provider_cancelled",
}

export enum ServiceCallType {
    IN_CALL = "in_call",   // customer comes to the provider
    OUT_CALL = "out_call", // provider travels to the customer
}

export enum ServicePaymentMethod {
    CARD = "card",
    WALLET = "wallet",
    MOMO = "momo",
}

export enum ServicePaymentStatus {
    PENDING = "pending",
    PAID = "paid",
    REFUNDED = "refunded",
}

@Entity("service_bookings")
export class ServiceBooking {
    @PrimaryGeneratedColumn("uuid")
    id: string;

    @Column({ type: "varchar", length: 50, unique: true })
    @Index()
    bookingNumber: string;

    @Column({ type: "uuid" })
    customerId: string;

    @Column({ type: "uuid" })
    merchantId: string;

    @Column({ type: "uuid" })
    productId: string;

    @Column({ type: "varchar", length: 255 })
    serviceTitle: string;

    @Column({ type: "decimal", precision: 12, scale: 2 })
    price: number;

    @Column({ type: "varchar", length: 10, default: "GHS" })
    currency: string;

    @Column({ type: "date" })
    preferredDate: Date;

    @Column({ type: "varchar", length: 20, nullable: true })
    preferredTimeSlot: string | null;

    @Column({ type: "text", nullable: true })
    serviceAddress: string | null;

    @Column({ type: "decimal", precision: 10, scale: 7, nullable: true })
    latitude: number | null;

    @Column({ type: "decimal", precision: 10, scale: 7, nullable: true })
    longitude: number | null;

    @Column({ type: "text", nullable: true })
    customerNotes: string | null;

    @Column({
        type: "enum",
        enum: ServiceBookingStatus,
        default: ServiceBookingStatus.REQUESTED,
    })
    status: ServiceBookingStatus;

    @Column({
        type: "enum",
        enum: ServicePaymentMethod,
    })
    paymentMethod: ServicePaymentMethod;

    @Column({
        type: "enum",
        enum: ServicePaymentStatus,
        default: ServicePaymentStatus.PENDING,
    })
    paymentStatus: ServicePaymentStatus;

    @Column({ type: "timestamp", nullable: true })
    scheduledAt: Date | null;

    @Column({ type: "timestamp", nullable: true })
    startedAt: Date | null;

    @Column({ type: "timestamp", nullable: true })
    completedAt: Date | null;

    @Column({ type: "timestamp", nullable: true })
    declinedAt: Date | null;

    @Column({ type: "varchar", length: 10, nullable: true })
    completionCode: string | null;

    // ── Call type + travel (out-call) ──
    @Column({ type: "varchar", length: 10, nullable: true })
    callType: "in_call" | "out_call" | null;

    @Column({ type: "decimal", precision: 12, scale: 2, default: 0 })
    travelFee: number;

    // Customer-paid platform fee per booked date (fixed + % of price, from
    // platform settings), locked at booking time. Platform revenue.
    @Column({ type: "decimal", precision: 12, scale: 2, default: 0 })
    platformFee: number;

    // Gateway processing fee the customer paid per date (bookings are card/momo).
    @Column({ type: "decimal", precision: 12, scale: 2, default: 0 })
    processingFee: number;

    @Column({ type: "decimal", precision: 6, scale: 2, nullable: true })
    travelDistanceKm: number | null;

    // Provider's IANA timezone captured at booking time (times shown to the
    // customer are in the provider's local time).
    @Column({ type: "varchar", length: 60, nullable: true })
    providerTimezone: string | null;

    // ── Cancellation money trail ──
    @Column({ type: "decimal", precision: 12, scale: 2, nullable: true })
    refundAmount: number | null;

    @Column({ type: "decimal", precision: 12, scale: 2, nullable: true })
    cancellationFee: number | null;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;

    @ManyToOne(() => User)
    @JoinColumn({ name: "customerId" })
    customer: User;

    @ManyToOne(() => User)
    @JoinColumn({ name: "merchantId" })
    merchant: User;

    @ManyToOne(() => Product)
    @JoinColumn({ name: "productId" })
    product: Product;
}
