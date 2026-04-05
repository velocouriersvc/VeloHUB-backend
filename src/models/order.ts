import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    CreateDateColumn,
    UpdateDateColumn,
    ManyToOne,
    OneToMany,
    JoinColumn,
    Index,
} from "typeorm";
import { User } from "./user";
import { PromoCode } from "./promo-code";
import { OrderStatusHistory } from "./order-status-history";

export enum OrderStatus {
    PENDING = "pending",
    ACCEPTED = "accepted",
    PREPARING = "preparing",
    READY_FOR_PICKUP = "ready_for_pickup",
    READY_FOR_DELIVERY = "ready_for_delivery",
    DRIVER_ASSIGNED = "driver_assigned",
    PICKED_UP = "picked_up",
    IN_TRANSIT = "in_transit",
    DELIVERED = "delivered",
    COMPLETED = "completed",
    CANCELLED = "cancelled",
    REFUNDED = "refunded",
}

export enum OrderPaymentMethod {
    MOMO = "momo",
    CARD = "card",
    CASH = "cash",
    WALLET = "wallet",
}

export enum OrderPaymentStatus {
    PENDING = "pending",
    PAID = "paid",
    ESCROWED = "escrowed",
    SETTLED = "settled",
    REFUNDED = "refunded",
}

export enum DeliveryType {
    DELIVERY = "delivery",
    PICKUP = "pickup",
}

export enum OrderCancelledBy {
    CUSTOMER = "customer",
    MERCHANT = "merchant",
    DRIVER = "driver",
    SYSTEM = "system",
    ADMIN = "admin",
}

@Entity("orders")
export class Order {
    @PrimaryGeneratedColumn("uuid")
    id: string;

    @Column({ type: "varchar", length: 20, unique: true })
    orderNumber: string;

    @Column({ type: "uuid" })
    @Index()
    customerId: string;

    @Column({ type: "uuid" })
    @Index()
    merchantId: string;

    @Column({ type: "uuid", nullable: true })
    @Index()
    driverId: string | null;

    // ── Items Snapshot ──
    @Column({ type: "jsonb" })
    items: Array<{
        productId: string;
        productName: string;
        productImage: string | null;
        quantity: number;
        unitPrice: number;
        selectedOptions: Array<{
            customizationId: string;
            optionId: string;
            optionName: string;
            price: number;
        }> | null;
        itemTotal: number;
    }>;

    // ── Money ──
    @Column({ type: "varchar", length: 3, default: "GHS" })
    currency: string;

    @Column({ type: "decimal", precision: 12, scale: 2 })
    subtotal: number;

    @Column({ type: "decimal", precision: 10, scale: 2 })
    serviceFee: number;

    @Column({ type: "decimal", precision: 10, scale: 2 })
    commission: number;

    @Column({ type: "decimal", precision: 10, scale: 2, default: 0 })
    deliveryFee: number;

    @Column({ type: "decimal", precision: 10, scale: 2, default: 0 })
    discountAmount: number;

    @Column({ type: "decimal", precision: 12, scale: 2 })
    totalAmount: number;

    @Column({ type: "decimal", precision: 12, scale: 2 })
    merchantEarnings: number;

    // ── Payment ──
    @Column({ type: "enum", enum: OrderPaymentMethod })
    paymentMethod: OrderPaymentMethod;

    @Column({ type: "enum", enum: OrderPaymentStatus, default: OrderPaymentStatus.PENDING })
    paymentStatus: OrderPaymentStatus;

    @Column({ type: "varchar", length: 255, nullable: true })
    paymentReference: string | null;

    // ── Delivery ──
    @Column({ type: "enum", enum: DeliveryType })
    deliveryType: DeliveryType;

    @Column({ type: "text", nullable: true })
    deliveryAddress: string | null;

    @Column({ type: "double precision", nullable: true })
    deliveryLat: number | null;

    @Column({ type: "double precision", nullable: true })
    deliveryLng: number | null;

    // ── Pickup ──
    @Column({ type: "varchar", length: 6, nullable: true })
    pickupCode: string | null;

    @Column({ type: "timestamp", nullable: true })
    pickupCodeVerifiedAt: Date | null;

    // ── Status ──
    @Column({ type: "enum", enum: OrderStatus, default: OrderStatus.PENDING })
    @Index()
    status: OrderStatus;

    @Column({ type: "enum", enum: OrderCancelledBy, nullable: true })
    cancelledBy: OrderCancelledBy | null;

    @Column({ type: "text", nullable: true })
    cancellationReason: string | null;

    // ── Promo ──
    @Column({ type: "uuid", nullable: true })
    promoCodeId: string | null;

    // ── Notes ──
    @Column({ type: "text", nullable: true })
    customerNote: string | null;

    @Column({ type: "text", nullable: true })
    merchantNote: string | null;

    // ── Timestamps ──
    @CreateDateColumn()
    createdAt: Date;

    @Column({ type: "timestamp", nullable: true })
    acceptedAt: Date | null;

    @Column({ type: "timestamp", nullable: true })
    preparingAt: Date | null;

    @Column({ type: "timestamp", nullable: true })
    readyAt: Date | null;

    @Column({ type: "timestamp", nullable: true })
    pickedUpAt: Date | null;

    @Column({ type: "timestamp", nullable: true })
    deliveredAt: Date | null;

    @Column({ type: "timestamp", nullable: true })
    completedAt: Date | null;

    @Column({ type: "timestamp", nullable: true })
    cancelledAt: Date | null;

    @UpdateDateColumn()
    updatedAt: Date;

    // ── Relations ──
    @ManyToOne(() => User, { onDelete: "CASCADE" })
    @JoinColumn({ name: "customerId" })
    customer: User;

    @ManyToOne(() => User)
    @JoinColumn({ name: "merchantId" })
    merchant: User;

    @ManyToOne(() => User, { nullable: true })
    @JoinColumn({ name: "driverId" })
    driver: User | null;

    @ManyToOne(() => PromoCode, { nullable: true })
    @JoinColumn({ name: "promoCodeId" })
    promoCode: PromoCode | null;

    @OneToMany(() => OrderStatusHistory, (h: OrderStatusHistory) => h.order, { cascade: true })
    statusHistory: OrderStatusHistory[];
}
