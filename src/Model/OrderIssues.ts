import { Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { Profiles } from "./Profiles";

@Index("order_issues_buyer_id_idx", ["buyerId"], {})
@Index("order_issues_pkey", ["id"], { unique: true })
@Index("order_issues_order_id_idx", ["orderId"], {})
@Index("order_issues_status_idx", ["status"], {})
@Entity("order_issues", { schema: "public" })
export class OrderIssues {
  @Column("uuid", {
    primary: true,
    name: "id",
    default: () => "gen_random_uuid()",
  })
  id: string;

  @Column("text", { name: "order_id" })
  orderId: string;

  @Column("text", { name: "order_number" })
  orderNumber: string;

  @Column("uuid", { name: "buyer_id", nullable: true })
  buyerId: string | null;

  @Column("text", { name: "issue_type" })
  issueType: string;

  @Column("text", { name: "description" })
  description: string;

  @Column("text", { name: "status", default: () => "'pending'" })
  status: string;

  @Column("text", { name: "resolution_notes", nullable: true })
  resolutionNotes: string | null;

  @Column("jsonb", { name: "images", nullable: true, default: [] })
  images: object | null;

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

  @Column("timestamp with time zone", { name: "resolved_at", nullable: true })
  resolvedAt: Date | null;

  @ManyToOne(() => Profiles, (profiles) => profiles.orderIssues)
  @JoinColumn([{ name: "buyer_id", referencedColumnName: "id" }])
  buyer: Profiles;
}
