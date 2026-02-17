import { Column, Entity, Index, PrimaryGeneratedColumn } from "typeorm";

@Index(
  "paystack_webhook_logs_event_type_transfer_code_idx",
  ["eventType", "transferCode"],
  {}
)
@Index("paystack_webhook_logs_pkey", ["id"], { unique: true })
@Entity("paystack_webhook_logs", { schema: "public" })
export class PaystackWebhookLogs {
  @PrimaryGeneratedColumn({ type: "bigint", name: "id" })
  id: string;

  @Column("timestamp with time zone", {
    name: "received_at",
    default: () => "now()",
  })
  receivedAt: Date;

  @Column("boolean", { name: "signature_valid" })
  signatureValid: boolean;

  @Column("text", { name: "event_type", nullable: true })
  eventType: string | null;

  @Column("text", { name: "meta_type", nullable: true })
  metaType: string | null;

  @Column("text", { name: "data_id", nullable: true })
  dataId: string | null;

  @Column("text", { name: "transfer_code", nullable: true })
  transferCode: string | null;

  @Column("text", { name: "status", nullable: true })
  status: string | null;

  @Column("text", { name: "reason", nullable: true })
  reason: string | null;

  @Column("jsonb", { name: "payload" })
  payload: object;
}
