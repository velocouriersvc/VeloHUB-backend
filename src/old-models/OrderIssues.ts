import { Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { Profiles } from "./Profiles";
import { Orders } from "./Orders";

@Index("order_issues_pkey", ["id"], { unique: true })
@Entity("order_issues", { schema: "public" })
export class OrderIssues {
  @Column("uuid", {
    primary: true,
    name: "id",
    default: () => "gen_random_uuid()",
  })
  id: string;

  @Column("text", { name: "order_number" })
  orderNumber: string;

  @Column("text", { name: "issue_type" })
  issueType: string;

  @Column("text", { name: "description", nullable: true })
  description: string | null;

  @Column("text", { name: "status", default: () => "'pending'" })
  status: string;

  @Column("text", { name: "resolution_notes", nullable: true })
  resolutionNotes: string | null;

  @Column("jsonb", { name: "images", nullable: true, default: [] })
  images: object | null;

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

  @Column("timestamp with time zone", { name: "resolved_at", nullable: true })
  resolvedAt: Date | null;

  @ManyToOne(() => Profiles, (profiles) => profiles.orderIssues, {
    onDelete: "CASCADE",
  })
  @JoinColumn([{ name: "buyer_id", referencedColumnName: "id" }])
  buyer: Profiles;

  @ManyToOne(() => Orders, (orders) => orders.orderIssues, {
    onDelete: "CASCADE",
  })
  @JoinColumn([{ name: "order_id", referencedColumnName: "id" }])
  order: Orders;
}
