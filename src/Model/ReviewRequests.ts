import { Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { Profiles } from "./Profiles";
import { Orders } from "./Orders";

@Index("idx_review_requests_buyer_id", ["buyerId"], {})
@Index("review_requests_order_id_buyer_id_key", ["buyerId", "orderId"], {
  unique: true,
})
@Index("review_requests_pkey", ["id"], { unique: true })
@Index("idx_review_requests_order_id", ["orderId"], {})
@Index("idx_review_requests_reminder_scheduled", ["reminderScheduledFor"], {})
@Index("idx_review_requests_seller_id_fkey", ["sellerId"], {})
@Index("idx_review_requests_status", ["status"], {})
@Entity("review_requests", { schema: "public" })
export class ReviewRequests {
  @Column("uuid", {
    primary: true,
    name: "id",
    default: () => "gen_random_uuid()",
  })
  id: string;

  @Column("uuid", { name: "order_id", unique: true })
  orderId: string;

  @Column("uuid", { name: "buyer_id", unique: true })
  buyerId: string;

  @Column("uuid", { name: "seller_id" })
  sellerId: string;

  @Column("timestamp with time zone", {
    name: "request_sent_at",
    nullable: true,
    default: () => "now()",
  })
  requestSentAt: Date | null;

  @Column("timestamp with time zone", {
    name: "reminder_sent_at",
    nullable: true,
  })
  reminderSentAt: Date | null;

  @Column("timestamp with time zone", {
    name: "review_submitted_at",
    nullable: true,
  })
  reviewSubmittedAt: Date | null;

  @Column("timestamp with time zone", {
    name: "reminder_scheduled_for",
    nullable: true,
  })
  reminderScheduledFor: Date | null;

  @Column("text", {
    name: "status",
    nullable: true,
    default: () => "'pending'",
  })
  status: string | null;

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

  @ManyToOne(() => Profiles, (profiles) => profiles.reviewRequests, {
    onDelete: "CASCADE",
  })
  @JoinColumn([{ name: "buyer_id", referencedColumnName: "id" }])
  buyer: Profiles;

  @ManyToOne(() => Orders, (orders) => orders.reviewRequests, {
    onDelete: "CASCADE",
  })
  @JoinColumn([{ name: "order_id", referencedColumnName: "id" }])
  order: Orders;

  @ManyToOne(() => Profiles, (profiles) => profiles.reviewRequests2, {
    onDelete: "CASCADE",
  })
  @JoinColumn([{ name: "seller_id", referencedColumnName: "id" }])
  seller: Profiles;
}
