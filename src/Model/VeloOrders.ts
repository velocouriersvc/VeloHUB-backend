import { Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { Profiles } from "./Profiles";

@Index("velo_orders_pkey", ["id"], { unique: true })
@Index("velo_orders_order_number_key", ["orderNumber"], { unique: true })
@Index("idx_velo_orders_payment_status", ["paymentStatus"], {})
@Index("idx_velo_orders_status", ["status"], {})
@Index("idx_velo_orders_user", ["userId"], {})
@Entity("velo_orders", { schema: "public" })
export class VeloOrders {
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

  @Column("jsonb", { name: "items", default: [] })
  items: object;

  @Column("numeric", { name: "subtotal" })
  subtotal: string;

  @Column("numeric", {
    name: "service_fee",
    nullable: true,
    default: () => "0",
  })
  serviceFee: string | null;

  @Column("numeric", { name: "total_amount" })
  totalAmount: string;

  @Column("jsonb", { name: "delivery_address", nullable: true })
  deliveryAddress: object | null;

  @Column("text", { name: "delivery_city", nullable: true })
  deliveryCity: string | null;

  @Column("text", { name: "status", default: () => "'pending'" })
  status: string;

  @Column("text", { name: "payment_status", default: () => "'pending'" })
  paymentStatus: string;

  @Column("text", { name: "payment_intent_id", nullable: true })
  paymentIntentId: string | null;

  @Column("text", { name: "stripe_customer_id", nullable: true })
  stripeCustomerId: string | null;

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

  @Column("timestamp with time zone", { name: "delivered_at", nullable: true })
  deliveredAt: Date | null;

  @ManyToOne(() => Profiles, (profiles) => profiles.veloOrders, {
    onDelete: "SET NULL",
  })
  @JoinColumn([{ name: "user_id", referencedColumnName: "id" }])
  user: Profiles;
}
