import { Column, Entity, Index } from "typeorm";

@Index("promotions_pkey", ["code"], { unique: true })
@Entity("promotions", { schema: "public" })
export class Promotions {
  @Column("character varying", { primary: true, name: "code" })
  code: string;

  @Column("character varying", {
    name: "discount_type",
    nullable: true,
    length: 10,
  })
  discountType: string | null;

  @Column("numeric", {
    name: "discount_value",
    nullable: true,
    precision: 12,
    scale: 2,
  })
  discountValue: string | null;

  @Column("timestamp with time zone", { name: "expires_at", nullable: true })
  expiresAt: Date | null;

  @Column("boolean", { name: "active", nullable: true, default: () => "true" })
  active: boolean | null;

  @Column("uuid", { name: "created_by", nullable: true })
  createdBy: string | null;

  @Column("timestamp with time zone", {
    name: "created_at",
    nullable: true,
    default: () => "now()",
  })
  createdAt: Date | null;

  @Column("text", { name: "promo_owner", nullable: true })
  promoOwner: string | null;
}
