import { Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { Orders } from "./Orders";
import { Profiles } from "./Profiles";

@Index("seller_payouts_pkey", ["id"], { unique: true })
@Index("idx_seller_payouts_order_id", ["orderId"], {})
@Index("idx_seller_payouts_seller_id", ["sellerId"], {})
@Entity("seller_payouts", { schema: "public" })
export class SellerPayouts {
  @Column("uuid", {
    primary: true,
    name: "id",
    default: () => "gen_random_uuid()",
  })
  id: string;

  @Column("uuid", { name: "seller_id", nullable: true })
  sellerId: string | null;

  @Column("uuid", { name: "order_id", nullable: true })
  orderId: string | null;

  @Column("numeric", { name: "amount" })
  amount: string;

  @Column("numeric", { name: "commission", default: () => "0" })
  commission: string;

  @Column("text", {
    name: "status",
    nullable: true,
    default: () => "'pending'",
  })
  status: string | null;

  @Column("text", { name: "payout_method", nullable: true })
  payoutMethod: string | null;

  @Column("text", { name: "transaction_id", nullable: true })
  transactionId: string | null;

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

  @Column("timestamp with time zone", { name: "completed_at", nullable: true })
  completedAt: Date | null;

  @ManyToOne(() => Orders, (orders) => orders.sellerPayouts)
  @JoinColumn([{ name: "order_id", referencedColumnName: "id" }])
  order: Orders;

  @ManyToOne(() => Profiles, (profiles) => profiles.sellerPayouts)
  @JoinColumn([{ name: "seller_id", referencedColumnName: "id" }])
  seller: Profiles;
}
