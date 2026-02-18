import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  OneToOne,
} from "typeorm";
import { Attachments } from "./Attachments";
import { Deliveries } from "./Deliveries";
import { OrderIssues } from "./OrderIssues";
import { OrderItems } from "./OrderItems";
import { OrderStatus } from "./OrderStatus";
import { OrderStatusLog } from "./OrderStatusLog";
import { BuyerInformation } from "./BuyerInformation";
import { Profiles } from "./Profiles";
import { Drivers } from "./Drivers";
import { Merchants } from "./Merchants";
import { ReviewRequests } from "./ReviewRequests";
import { Rides } from "./Rides";
import { Transactions } from "./Transactions";

@Index("idx_orders_buyer_id", ["buyerId"], {})
@Index("orders_driver_accepted_at_idx", ["driverAcceptedAt"], {})
@Index("orders_driver_id_idx", ["driverId"], {})
@Index("orders_pkey", ["id"], { unique: true })
@Index("idx_orders_merchant_id", ["merchantId"], {})
@Index("orders_order_number_key", ["orderNumber"], { unique: true })
@Index("idx_orders_payment_reference", ["paymentReference"], {})
@Index("orders_status_idx", ["status"], {})
@Index("idx_orders_status", ["status"], {})
@Entity("orders", { schema: "public" })
export class Orders {
  @Column("uuid", {
    primary: true,
    name: "id",
    default: () => "gen_random_uuid()",
  })
  id: string;

  @Column("character varying", {
    name: "order_number",
    unique: true,
    length: 50,
  })
  orderNumber: string;

  @Column("uuid", { name: "buyer_id" })
  buyerId: string;

  @Column("uuid", { name: "merchant_id", nullable: true })
  merchantId: string | null;

  @Column("numeric", { name: "subtotal", precision: 12, scale: 2 })
  subtotal: string;

  @Column("numeric", {
    name: "delivery_fee",
    nullable: true,
    precision: 12,
    scale: 2,
    default: () => "0.00",
  })
  deliveryFee: string | null;

  @Column("numeric", {
    name: "service_fee",
    nullable: true,
    precision: 12,
    scale: 2,
    default: () => "0.00",
  })
  serviceFee: string | null;

  @Column("numeric", {
    name: "tax_amount",
    nullable: true,
    precision: 12,
    scale: 2,
    default: () => "0.00",
  })
  taxAmount: string | null;

  @Column("numeric", {
    name: "discount_amount",
    nullable: true,
    precision: 12,
    scale: 2,
    default: () => "0.00",
  })
  discountAmount: string | null;

  @Column("numeric", {
    name: "tip_amount",
    nullable: true,
    precision: 12,
    scale: 2,
    default: () => "0.00",
  })
  tipAmount: string | null;

  @Column("numeric", { name: "total_major", precision: 12, scale: 2 })
  totalMajor: string;

  @Column("numeric", {
    name: "escrow_amount",
    nullable: true,
    precision: 12,
    scale: 2,
    default: () => "0.00",
  })
  escrowAmount: string | null;

  @Column("numeric", {
    name: "refund_fee",
    nullable: true,
    precision: 12,
    scale: 2,
    default: () => "0.00",
  })
  refundFee: string | null;

  @Column("text", { name: "delivery_address", nullable: true })
  deliveryAddress: string | null;

  @Column("numeric", {
    name: "delivery_lat",
    nullable: true,
    precision: 10,
    scale: 8,
  })
  deliveryLat: string | null;

  @Column("numeric", {
    name: "delivery_lng",
    nullable: true,
    precision: 11,
    scale: 8,
  })
  deliveryLng: string | null;

  @Column("enum", {
    name: "delivery_type",
    nullable: true,
    enum: ["standard", "express"],
    default: () => "'standard'",
  })
  deliveryType: "standard" | "express" | null;

  @Column("enum", {
    name: "status",
    nullable: true,
    enum: [
      "pending",
      "confirmed",
      "preparing_order",
      "ready_for_pickup",
      "driver_assigned",
      "picked_up",
      "in_transit",
      "delivered",
      "cancelled",
      "refunded",
      "pending_payment",
      "paid",
      "awaiting_confirmation",
    ],
    default: () => "'pending_payment'",
  })
  status:
    | "pending"
    | "confirmed"
    | "preparing_order"
    | "ready_for_pickup"
    | "driver_assigned"
    | "picked_up"
    | "in_transit"
    | "delivered"
    | "cancelled"
    | "refunded"
    | "pending_payment"
    | "paid"
    | "awaiting_confirmation"
    | null;

  @Column("timestamp with time zone", { name: "cancelled_at", nullable: true })
  cancelledAt: Date | null;

  @Column("text", { name: "cancellation_reason", nullable: true })
  cancellationReason: string | null;

  @Column("enum", {
    name: "cancelled_by",
    nullable: true,
    enum: ["buyer", "merchant", "driver", "system"],
  })
  cancelledBy: "buyer" | "merchant" | "driver" | "system" | null;

  @Column("enum", {
    name: "payment_method",
    nullable: true,
    enum: ["paystack", "other", "cash"],
  })
  paymentMethod: "paystack" | "other" | "cash" | null;

  @Column("enum", {
    name: "payment_status",
    nullable: true,
    enum: [
      "pending",
      "held",
      "completed",
      "refunded",
      "initiated",
      "successful",
      "failed",
    ],
    default: () => "'pending'",
  })
  paymentStatus:
    | "pending"
    | "held"
    | "completed"
    | "refunded"
    | "initiated"
    | "successful"
    | "failed"
    | null;

  @Column("text", { name: "payment_reference", nullable: true })
  paymentReference: string | null;

  @Column("timestamp with time zone", { name: "refunded_at", nullable: true })
  refundedAt: Date | null;

  @Column("character varying", {
    name: "promo_code",
    nullable: true,
    length: 50,
  })
  promoCode: string | null;

  @Column("timestamp with time zone", {
    name: "created_at",
    nullable: true,
    default: () => "now()",
  })
  createdAt: Date | null;

  @Column("timestamp with time zone", {
    name: "updated_at",
    nullable: true,
    default: () => "now()",
  })
  updatedAt: Date | null;

  @Column("timestamp with time zone", { name: "paid_at", nullable: true })
  paidAt: Date | null;

  @Column("numeric", { name: "total_minor" })
  totalMinor: string;

  @Column("jsonb", { name: "pricing_snapshot" })
  pricingSnapshot: object;

  @Column("jsonb", { name: "metadata", nullable: true })
  metadata: object | null;

  @Column("text", { name: "failed_reason", nullable: true })
  failedReason: string | null;

  @Column("numeric", {
    name: "refunded_amount",
    nullable: true,
    precision: 12,
    scale: 2,
    default: () => "0.00",
  })
  refundedAmount: string | null;

  @Column("timestamp with time zone", { name: "fulfilled_at", nullable: true })
  fulfilledAt: Date | null;

  @Column("uuid", { name: "driver_id", nullable: true })
  driverId: string | null;

  @Column("timestamp with time zone", {
    name: "driver_accepted_at",
    nullable: true,
  })
  driverAcceptedAt: Date | null;

  @Column("text", { name: "pickup_code", nullable: true })
  pickupCode: string | null;

  @Column("text", { name: "delivery_code", nullable: true })
  deliveryCode: string | null;

  @Column("timestamp with time zone", {
    name: "driver_arrived_at_pickup_at",
    nullable: true,
  })
  driverArrivedAtPickupAt: Date | null;

  @Column("numeric", {
    name: "pickup_lat",
    nullable: true,
    precision: 10,
    scale: 8,
  })
  pickupLat: string | null;

  @Column("numeric", {
    name: "pickup_lng",
    nullable: true,
    precision: 11,
    scale: 8,
  })
  pickupLng: string | null;

  @Column("timestamp with time zone", { name: "assigned_at", nullable: true })
  assignedAt: Date | null;

  @Column("timestamp with time zone", { name: "accepted_at", nullable: true })
  acceptedAt: Date | null;

  @Column("timestamp with time zone", { name: "picked_up_at", nullable: true })
  pickedUpAt: Date | null;

  @Column("timestamp with time zone", { name: "completed_at", nullable: true })
  completedAt: Date | null;

  @Column("timestamp with time zone", {
    name: "estimated_ready_time",
    nullable: true,
  })
  estimatedReadyTime: Date | null;

  @Column("boolean", {
    name: "is_scheduled",
    nullable: true,
    default: () => "false",
  })
  isScheduled: boolean | null;

  @Column("text", {
    name: "order_type",
    nullable: true,
    default: () => "'delivery'",
  })
  orderType: string | null;

  @Column("numeric", {
    name: "driver_lat",
    nullable: true,
    precision: 10,
    scale: 8,
  })
  driverLat: string | null;

  @Column("numeric", {
    name: "driver_lng",
    nullable: true,
    precision: 11,
    scale: 8,
  })
  driverLng: string | null;

  @OneToMany(() => Attachments, (attachments) => attachments.order)
  attachments: Attachments[];

  @OneToMany(() => Deliveries, (deliveries) => deliveries.order)
  deliveries: Deliveries[];

  @OneToMany(() => OrderIssues, (orderIssues) => orderIssues.order)
  orderIssues: OrderIssues[];

  @OneToMany(() => OrderItems, (orderItems) => orderItems.order)
  orderItems: OrderItems[];

  @OneToMany(() => OrderStatus, (orderStatus) => orderStatus.order)
  orderStatuses: OrderStatus[];

  @OneToMany(() => OrderStatusLog, (orderStatusLog) => orderStatusLog.order)
  orderStatusLogs: OrderStatusLog[];

  @ManyToOne(
    () => BuyerInformation,
    (buyerInformation) => buyerInformation.orders,
    { onDelete: "CASCADE" }
  )
  @JoinColumn([{ name: "buyer_id", referencedColumnName: "id" }])
  buyer: BuyerInformation;

  @ManyToOne(() => Profiles, (profiles) => profiles.orders, {
    onDelete: "CASCADE",
  })
  @JoinColumn([{ name: "buyer_id", referencedColumnName: "id" }])
  buyer_2: Profiles;

  @ManyToOne(() => Drivers, (drivers) => drivers.orders)
  @JoinColumn([{ name: "driver_id", referencedColumnName: "id" }])
  driver: Drivers;

  @ManyToOne(() => Merchants, (merchants) => merchants.orders, {
    onDelete: "SET NULL",
  })
  @JoinColumn([{ name: "merchant_id", referencedColumnName: "id" }])
  merchant: Merchants;

  @OneToMany(() => ReviewRequests, (reviewRequests) => reviewRequests.order)
  reviewRequests: ReviewRequests[];

  @OneToMany(() => Rides, (rides) => rides.order)
  rides: Rides[];

  @OneToOne(() => Transactions, (transactions) => transactions.order)
  transactions: Transactions;
}
