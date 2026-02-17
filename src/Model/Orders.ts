import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
} from "typeorm";
import { AuditLogs } from "./AuditLogs";
import { DriverVerificationLocks } from "./DriverVerificationLocks";
import { OrderStatusHistory } from "./OrderStatusHistory";
import { Payments } from "./Payments";
import { Profiles } from "./Profiles";
import { ProductShares } from "./ProductShares";
import { ReviewRequests } from "./ReviewRequests";
import { Reviews } from "./Reviews";
import { RideRequests } from "./RideRequests";
import { SellerPayouts } from "./SellerPayouts";
import { StoreShares } from "./StoreShares";

@Index("idx_orders_delivery_code", ["deliveryCode"], {})
@Index("idx_orders_expiration", ["expirationTime"], {})
@Index("orders_pkey", ["id"], { unique: true })
@Index("orders_order_number_key", ["orderNumber"], { unique: true })
@Index("idx_orders_payment_id_fkey", ["paymentId"], {})
@Index("idx_orders_pickup_code", ["pickupCode"], {})
@Index("idx_orders_seller_id", ["sellerId"], {})
@Index("idx_orders_seller_status", ["sellerId", "status"], {})
@Index("idx_orders_user_id_fkey", ["userId"], {})
@Entity("orders", { schema: "public" })
export class Orders {
  @Column("uuid", {
    primary: true,
    name: "id",
    default: () => "gen_random_uuid()",
  })
  id: string;

  @Column("uuid", { name: "user_id", nullable: true })
  userId: string | null;

  @Column("text", { name: "order_number", unique: true })
  orderNumber: string;

  @Column("text", { name: "order_type" })
  orderType: string;

  @Column("jsonb", { name: "items", nullable: true, default: [] })
  items: object | null;

  @Column("numeric", { name: "total_amount" })
  totalAmount: string;

  @Column("jsonb", { name: "delivery_address", nullable: true })
  deliveryAddress: object | null;

  @Column("jsonb", { name: "pickup_location", nullable: true })
  pickupLocation: object | null;

  @Column("jsonb", { name: "dropoff_location", nullable: true })
  dropoffLocation: object | null;

  @Column("text", { name: "status", default: () => "'pending'" })
  status: string;

  @Column("uuid", { name: "driver_id", nullable: true })
  driverId: string | null;

  @Column("timestamp with time zone", {
    name: "estimated_delivery_time",
    nullable: true,
  })
  estimatedDeliveryTime: Date | null;

  @Column("timestamp with time zone", {
    name: "actual_delivery_time",
    nullable: true,
  })
  actualDeliveryTime: Date | null;

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

  @Column("text", {
    name: "payment_status",
    nullable: true,
    default: () => "'pending'",
  })
  paymentStatus: string | null;

  @Column("uuid", { name: "payment_id", nullable: true })
  paymentId: string | null;

  @Column("uuid", { name: "seller_id", nullable: true })
  sellerId: string | null;

  @Column("numeric", {
    name: "delivery_fee",
    nullable: true,
    default: () => "0",
  })
  deliveryFee: string | null;

  @Column("numeric", { name: "tip", nullable: true, default: () => "0" })
  tip: string | null;

  @Column("timestamp with time zone", { name: "scheduled_for", nullable: true })
  scheduledFor: Date | null;

  @Column("text", { name: "cancellation_reason", nullable: true })
  cancellationReason: string | null;

  @Column("timestamp with time zone", { name: "cancelled_at", nullable: true })
  cancelledAt: Date | null;

  @Column("timestamp with time zone", {
    name: "rescheduled_from",
    nullable: true,
  })
  rescheduledFrom: Date | null;

  @Column("boolean", {
    name: "is_scheduled",
    nullable: true,
    default: () => "false",
  })
  isScheduled: boolean | null;

  @Column("timestamp with time zone", {
    name: "expiration_time",
    nullable: true,
  })
  expirationTime: Date | null;

  @Column("text", { name: "item_name", nullable: true })
  itemName: string | null;

  @Column("text", { name: "category", nullable: true })
  category: string | null;

  @Column("text", { name: "buyer_name", nullable: true })
  buyerName: string | null;

  @Column("integer", { name: "pickup_code", nullable: true })
  pickupCode: number | null;

  @Column("integer", { name: "delivery_code", nullable: true })
  deliveryCode: number | null;

  @Column("timestamp with time zone", {
    name: "codes_generated_at",
    nullable: true,
  })
  codesGeneratedAt: Date | null;

  @Column("timestamp with time zone", {
    name: "pickup_verified_at",
    nullable: true,
  })
  pickupVerifiedAt: Date | null;

  @Column("timestamp with time zone", {
    name: "delivery_verified_at",
    nullable: true,
  })
  deliveryVerifiedAt: Date | null;

  @Column("integer", {
    name: "verification_attempts",
    nullable: true,
    default: () => "0",
  })
  verificationAttempts: number | null;

  @Column("integer", {
    name: "seller_verification_attempts",
    nullable: true,
    default: () => "0",
  })
  sellerVerificationAttempts: number | null;

  @Column("timestamp with time zone", {
    name: "seller_verification_locked_until",
    nullable: true,
  })
  sellerVerificationLockedUntil: Date | null;

  @Column("timestamp with time zone", {
    name: "seller_verified_at",
    nullable: true,
  })
  sellerVerifiedAt: Date | null;

  @OneToMany(() => AuditLogs, (auditLogs) => auditLogs.order)
  auditLogs: AuditLogs[];

  @OneToMany(
    () => DriverVerificationLocks,
    (driverVerificationLocks) => driverVerificationLocks.order
  )
  driverVerificationLocks: DriverVerificationLocks[];

  @OneToMany(
    () => OrderStatusHistory,
    (orderStatusHistory) => orderStatusHistory.order
  )
  orderStatusHistories: OrderStatusHistory[];

  @ManyToOne(() => Payments, (payments) => payments.orders)
  @JoinColumn([{ name: "payment_id", referencedColumnName: "id" }])
  payment: Payments;

  @ManyToOne(() => Profiles, (profiles) => profiles.orders)
  @JoinColumn([{ name: "seller_id", referencedColumnName: "id" }])
  seller: Profiles;

  @ManyToOne(() => Profiles, (profiles) => profiles.orders2)
  @JoinColumn([{ name: "user_id", referencedColumnName: "id" }])
  user: Profiles;

  @OneToMany(() => Payments, (payments) => payments.order)
  payments: Payments[];

  @OneToMany(
    () => ProductShares,
    (productShares) => productShares.conversionOrder
  )
  productShares: ProductShares[];

  @OneToMany(() => ReviewRequests, (reviewRequests) => reviewRequests.order)
  reviewRequests: ReviewRequests[];

  @OneToMany(() => Reviews, (reviews) => reviews.order)
  reviews: Reviews[];

  @OneToMany(() => RideRequests, (rideRequests) => rideRequests.order)
  rideRequests: RideRequests[];

  @OneToMany(() => SellerPayouts, (sellerPayouts) => sellerPayouts.order)
  sellerPayouts: SellerPayouts[];

  @OneToMany(() => StoreShares, (storeShares) => storeShares.conversionOrder)
  storeShares: StoreShares[];
}
