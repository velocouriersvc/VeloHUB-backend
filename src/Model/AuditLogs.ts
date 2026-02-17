import { Column, Entity, Index } from "typeorm";

@Index("audit_logs_pkey", ["id"], { unique: true })
@Entity("audit_logs", { schema: "public" })
export class AuditLogs {
  @Column("uuid", {
    primary: true,
    name: "id",
    default: () => "gen_random_uuid()",
  })
  id: string;

  @Column("uuid", { name: "user_id", nullable: true })
  userId: string | null;

  @Column("uuid", { name: "order_id", nullable: true })
  orderId: string | null;

  @Column("text", { name: "action" })
  action: string;

  @Column("timestamp with time zone", {
    name: "timestamp",
    nullable: true,
    default: () => "now()",
  })
  timestamp: Date | null;

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
}
