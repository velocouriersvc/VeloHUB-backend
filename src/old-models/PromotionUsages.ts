import { Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { Promotions } from "./Promotions";
import { Profiles } from "./Profiles";

@Index("promotion_usages_pkey", ["id"], { unique: true })
@Index("unique_promo_per_user", ["promoCode", "userId"], { unique: true })
@Entity("promotion_usages", { schema: "public" })
export class PromotionUsages {
  @Column("uuid", {
    primary: true,
    name: "id",
    default: () => "gen_random_uuid()",
  })
  id: string;

  @Column("character varying", { name: "promo_code", unique: true })
  promoCode: string;

  @Column("uuid", { name: "user_id", unique: true })
  userId: string;

  @Column("uuid", { name: "order_id", nullable: true })
  orderId: string | null;

  @Column("timestamp with time zone", {
    name: "used_at",
    default: () => "now()",
  })
  usedAt: Date;

  @ManyToOne(() => Promotions, (promotions) => promotions.promotionUsages, {
    onDelete: "CASCADE",
  })
  @JoinColumn([{ name: "promo_code", referencedColumnName: "code" }])
  promoCode2: Promotions;

  @ManyToOne(() => Profiles, (profiles) => profiles.promotionUsages, {
    onDelete: "CASCADE",
  })
  @JoinColumn([{ name: "user_id", referencedColumnName: "id" }])
  user: Profiles;
}
