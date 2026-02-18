import { Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { Profiles } from "./Profiles";
import { Orders } from "./Orders";

@Index("review_requests_pkey", ["id"], { unique: true })
@Entity("review_requests", { schema: "public" })
export class ReviewRequests {
  @Column("uuid", {
    primary: true,
    name: "id",
    default: () => "gen_random_uuid()",
  })
  id: string;

  @Column("timestamp with time zone", {
    name: "reminder_scheduled_for",
    nullable: true,
  })
  reminderScheduledFor: Date | null;

  @Column("text", { name: "status" })
  status: string;

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
    name: "created_at",
    default: () => "timezone('utc', now())",
  })
  createdAt: Date;

  @Column("timestamp with time zone", {
    name: "updated_at",
    default: () => "timezone('utc', now())",
  })
  updatedAt: Date;

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
