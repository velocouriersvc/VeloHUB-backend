import { Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { Orders } from "./Orders";
import { Profiles } from "./Profiles";

@Index("idx_reviews_created_at", ["createdAt"], {})
@Index("reviews_pkey", ["id"], { unique: true })
@Index("idx_reviews_order", ["orderId"], {})
@Index("idx_reviews_reviewable", ["reviewableId", "reviewableType"], {})
@Index("idx_reviews_reviewer", ["reviewerId"], {})
@Entity("reviews", { schema: "public" })
export class Reviews {
  @Column("uuid", {
    primary: true,
    name: "id",
    default: () => "gen_random_uuid()",
  })
  id: string;

  @Column("integer", { name: "rating" })
  rating: number;

  @Column("text", { name: "comment", nullable: true })
  comment: string | null;

  @Column("uuid", { name: "reviewable_id" })
  reviewableId: string;

  @Column("text", { name: "reviewable_type" })
  reviewableType: string;

  @Column("uuid", { name: "reviewer_id" })
  reviewerId: string;

  @Column("uuid", { name: "order_id", nullable: true })
  orderId: string | null;

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

  @Column("integer", { name: "seller_rating", nullable: true })
  sellerRating: number | null;

  @Column("text", { name: "seller_comment", nullable: true })
  sellerComment: string | null;

  @Column("integer", { name: "delivery_rating", nullable: true })
  deliveryRating: number | null;

  @Column("text", { name: "delivery_comment", nullable: true })
  deliveryComment: string | null;

  @Column("text", {
    name: "review_type",
    nullable: true,
    default: () => "'combined'",
  })
  reviewType: string | null;

  @ManyToOne(() => Orders, (orders) => orders.reviews, { onDelete: "SET NULL" })
  @JoinColumn([{ name: "order_id", referencedColumnName: "id" }])
  order: Orders;

  @ManyToOne(() => Profiles, (profiles) => profiles.reviews, {
    onDelete: "CASCADE",
  })
  @JoinColumn([{ name: "reviewer_id", referencedColumnName: "id" }])
  reviewer: Profiles;
}
