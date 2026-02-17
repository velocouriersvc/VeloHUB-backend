import { Column, Entity, Index } from "typeorm";

@Index(
  "user_discounts_user_id_discount_type_source_key",
  ["discountType", "source", "userId"],
  { unique: true }
)
@Index("user_discounts_pkey", ["id"], { unique: true })
@Index("idx_user_discounts_user", ["userId"], {})
@Entity("user_discounts", { schema: "public" })
export class UserDiscounts {
  @Column("uuid", {
    primary: true,
    name: "id",
    default: () => "uuid_generate_v4()",
  })
  id: string;

  @Column("uuid", { name: "user_id", unique: true })
  userId: string;

  @Column("text", { name: "discount_type", unique: true })
  discountType: string;

  @Column("numeric", { name: "discount_value", precision: 14, scale: 2 })
  discountValue: string;

  @Column("integer", { name: "uses_remaining", default: () => "1" })
  usesRemaining: number;

  @Column("numeric", {
    name: "min_order_amount",
    precision: 14,
    scale: 2,
    default: () => "0",
  })
  minOrderAmount: string;

  @Column("boolean", { name: "is_first_order", default: () => "false" })
  isFirstOrder: boolean;

  @Column("text", { name: "source", unique: true })
  source: string;

  @Column("timestamp with time zone", {
    name: "created_at",
    default: () => "now()",
  })
  createdAt: Date;

  @Column("timestamp with time zone", { name: "expires_at", nullable: true })
  expiresAt: Date | null;
}
