import { Column, Entity, Index } from "typeorm";

@Index("admin_alerts_pkey", ["id"], { unique: true })
@Entity("admin_alerts", { schema: "public" })
export class AdminAlerts {
  @Column("uuid", {
    primary: true,
    name: "id",
    default: () => "gen_random_uuid()",
  })
  id: string;

  @Column("text", { name: "alert_type" })
  alertType: string;

  @Column("text", { name: "severity" })
  severity: string;

  @Column("text", { name: "title" })
  title: string;

  @Column("text", { name: "message" })
  message: string;

  @Column("jsonb", { name: "metadata", nullable: true })
  metadata: object | null;

  @Column("timestamp with time zone", {
    name: "created_at",
    nullable: true,
    default: () => "now()",
  })
  createdAt: Date | null;

  @Column("timestamp with time zone", { name: "resolved_at", nullable: true })
  resolvedAt: Date | null;

  @Column("uuid", { name: "resolved_by", nullable: true })
  resolvedBy: string | null;
}
