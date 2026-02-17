import { Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { Orders } from "./Orders";
import { Profiles } from "./Profiles";

@Index("idx_audit_logs_action", ["action"], {})
@Index("audit_logs_pkey", ["id"], { unique: true })
@Index("idx_audit_logs_order_id", ["orderId"], {})
@Index("idx_audit_logs_timestamp", ["timestamp"], {})
@Index("idx_audit_logs_user_id", ["userId"], {})
@Entity("audit_logs", { schema: "public" })
export class AuditLogs {
  @Column("uuid", {
    primary: true,
    name: "id",
    default: () => "gen_random_uuid()",
  })
  id: string;

  @Column("uuid", { name: "order_id", nullable: true })
  orderId: string | null;

  @Column("uuid", { name: "user_id", nullable: true })
  userId: string | null;

  @Column("text", { name: "action" })
  action: string;

  @Column("timestamp with time zone", {
    name: "timestamp",
    nullable: true,
    default: () => "now()",
  })
  timestamp: Date | null;

  @Column("inet", { name: "ip_address", nullable: true })
  ipAddress: string | null;

  @Column("text", { name: "device_model", nullable: true })
  deviceModel: string | null;

  @Column("text", { name: "os_version", nullable: true })
  osVersion: string | null;

  @Column("jsonb", { name: "metadata", nullable: true, default: {} })
  metadata: object | null;

  @Column("timestamp with time zone", {
    name: "created_at",
    nullable: true,
    default: () => "now()",
  })
  createdAt: Date | null;

  @ManyToOne(() => Orders, (orders) => orders.auditLogs, {
    onDelete: "CASCADE",
  })
  @JoinColumn([{ name: "order_id", referencedColumnName: "id" }])
  order: Orders;

  @ManyToOne(() => Profiles, (profiles) => profiles.auditLogs, {
    onDelete: "CASCADE",
  })
  @JoinColumn([{ name: "user_id", referencedColumnName: "id" }])
  user: Profiles;
}
