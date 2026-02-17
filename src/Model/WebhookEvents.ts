import { Column, Entity, Index } from "typeorm";

@Index("idx_webhook_events_created", ["createdAt"], {})
@Index("webhook_events_event_id_key", ["eventId"], { unique: true })
@Index("idx_webhook_events_event_id", ["eventId"], {})
@Index("webhook_events_pkey", ["id"], { unique: true })
@Index("idx_webhook_events_provider", ["provider"], {})
@Index("idx_webhook_events_status", ["status"], {})
@Entity("webhook_events", { schema: "public" })
export class WebhookEvents {
  @Column("uuid", {
    primary: true,
    name: "id",
    default: () => "gen_random_uuid()",
  })
  id: string;

  @Column("text", { name: "provider" })
  provider: string;

  @Column("text", { name: "event_type" })
  eventType: string;

  @Column("text", { name: "event_id", unique: true })
  eventId: string;

  @Column("jsonb", { name: "raw_payload" })
  rawPayload: object;

  @Column("text", { name: "signature", nullable: true })
  signature: string | null;

  @Column("boolean", {
    name: "signature_verified",
    nullable: true,
    default: () => "false",
  })
  signatureVerified: boolean | null;

  @Column("text", {
    name: "status",
    nullable: true,
    default: () => "'pending'",
  })
  status: string | null;

  @Column("integer", {
    name: "retry_count",
    nullable: true,
    default: () => "0",
  })
  retryCount: number | null;

  @Column("integer", {
    name: "max_retries",
    nullable: true,
    default: () => "5",
  })
  maxRetries: number | null;

  @Column("text", { name: "error_message", nullable: true })
  errorMessage: string | null;

  @Column("timestamp with time zone", { name: "processed_at", nullable: true })
  processedAt: Date | null;

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
}
