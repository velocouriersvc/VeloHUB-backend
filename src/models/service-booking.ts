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

    @Column({ type: "text" })
    serviceAddress: string;

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
