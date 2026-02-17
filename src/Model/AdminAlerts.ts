import { Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { Profiles } from "./Profiles";

@Index("idx_admin_alerts_acknowledged", ["acknowledged"], {})
@Index("idx_admin_alerts_created", ["createdAt"], {})
@Index("admin_alerts_pkey", ["id"], { unique: true })
@Index("idx_admin_alerts_severity", ["severity"], {})
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

  @Column("jsonb", { name: "metadata", nullable: true, default: {} })
  metadata: object | null;

  @Column("boolean", {
    name: "acknowledged",
    nullable: true,
    default: () => "false",
  })
  acknowledged: boolean | null;

  @Column("timestamp with time zone", {
    name: "acknowledged_at",
    nullable: true,
  })
  acknowledgedAt: Date | null;

  @Column("timestamp with time zone", {
    name: "created_at",
    nullable: true,
    default: () => "now()",
  })
  createdAt: Date | null;

  @ManyToOne(() => Profiles, (profiles) => profiles.adminAlerts, {
    onDelete: "SET NULL",
  })
  @JoinColumn([{ name: "acknowledged_by", referencedColumnName: "id" }])
  acknowledgedBy: Profiles;
}
