import { Column, Entity, Index, JoinColumn, OneToOne } from "typeorm";
import { Orders } from "./Orders";

@Index("transactions_pkey", ["id"], { unique: true })
@Index("unique_order_payment", ["orderId", "type"], { unique: true })
@Index("idx_one_pending_payment_per_order", ["orderId"], { unique: true })
@Index("idx_transactions_reference", ["providerReference"], {})
@Entity("transactions", { schema: "public" })
export class Transactions {
  @Column("uuid", {
    primary: true,
    name: "id",
    default: () => "gen_random_uuid()",
  })
  id: string;

  @Column("uuid", { name: "order_id", unique: true })
  orderId: string;

  @Column("enum", {
    name: "type",
    unique: true,
    enum: ["payment", "escrow_hold", "escrow_release", "refund", "payout"],
  })
  type: "payment" | "escrow_hold" | "escrow_release" | "refund" | "payout";

  @Column("numeric", { name: "amount", precision: 12, scale: 2 })
  amount: string;

  @Column("numeric", {
    name: "fee",
    nullable: true,
    precision: 12,
    scale: 2,
    default: () => "0.00",
  })
  fee: string | null;

  @Column("numeric", {
    name: "platform_fee",
    nullable: true,
    precision: 12,
    scale: 2,
    default: () => "0.00",
  })
  platformFee: string | null;

  @Column("enum", {
    name: "status",
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
  status:
    | "pending"
    | "held"
    | "completed"
    | "refunded"
    | "initiated"
    | "successful"
    | "failed"
    | null;

  @Column("text", { name: "provider_reference", nullable: true })
  providerReference: string | null;

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
    name: "provider",
    nullable: true,
    default: () => "'paystack'",
  })
  provider: string | null;

  @Column("jsonb", { name: "provider_response", nullable: true })
  providerResponse: object | null;

  @Column("jsonb", { name: "metadata", nullable: true })
  metadata: object | null;

  @Column("text", { name: "access_code", nullable: true })
  accessCode: string | null;

  @Column("text", { name: "authorization_url", nullable: true })
  authorizationUrl: string | null;

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

  @Column("text", { name: "payment_source" })
  paymentSource: string;

  @Column("text", { name: "escrow_status", default: () => "'held'" })
  escrowStatus: string;

  @Column("numeric", {
    name: "merchant_amount",
    precision: 12,
    scale: 2,
    default: () => "0",
  })
  merchantAmount: string;

  @Column("numeric", {
    name: "driver_amount",
    precision: 12,
    scale: 2,
    default: () => "0",
  })
  driverAmount: string;

  @Column("numeric", {
    name: "platform_amount",
    precision: 12,
    scale: 2,
    default: () => "0",
  })
  platformAmount: string;

  @OneToOne(() => Orders, (orders) => orders.transactions, {
    onDelete: "RESTRICT",
  })
  @JoinColumn([{ name: "order_id", referencedColumnName: "id" }])
  order: Orders;
}
