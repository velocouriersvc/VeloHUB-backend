import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
} from "typeorm";
import { PromotionUsages } from "./PromotionUsages";
import { Profiles } from "./Profiles";

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

  @Column("timestamp with time zone", {
    name: "created_at",
    nullable: true,
    default: () => "now()",
  })
  createdAt: Date | null;

  @Column("text", { name: "promo_owner", nullable: true })
  promoOwner: string | null;

  @Column("integer", { name: "usage_limit", nullable: true })
  usageLimit: number | null;

  @Column("numeric", {
    name: "min_order_amount",
    nullable: true,
    precision: 12,
    scale: 2,
  })
  minOrderAmount: string | null;

  @Column("numeric", {
    name: "max_discount_amount",
    nullable: true,
    precision: 12,
    scale: 2,
  })
  maxDiscountAmount: string | null;

  @Column("text", {
    name: "applies_to",
    array: true,
    default: () => "'{ride,delivery,ecommerce}'[]",
  })
  appliesTo: string[];

  @OneToMany(
    () => PromotionUsages,
    (promotionUsages) => promotionUsages.promoCode2
  )
  promotionUsages: PromotionUsages[];

  @ManyToOne(() => Profiles, (profiles) => profiles.promotions)
  @JoinColumn([{ name: "created_by", referencedColumnName: "id" }])
  createdBy: Profiles;
}
