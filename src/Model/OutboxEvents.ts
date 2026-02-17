import { Column, Entity, Index } from "typeorm";

@Index("idx_outbox_events_aggregate", ["aggregateId", "aggregateType"], {})
@Index("idx_outbox_events_created", ["createdAt"], {})
@Index("outbox_events_pkey", ["id"], { unique: true })
@Index("idx_outbox_events_status", ["status"], {})
@Entity("outbox_events", { schema: "public" })
export class OutboxEvents {
  @Column("uuid", {
    primary: true,
    name: "id",
    default: () => "gen_random_uuid()",
  })
  id: string;

  @Column("text", { name: "aggregate_type" })
  aggregateType: string;

  @Column("uuid", { name: "aggregate_id" })
  aggregateId: string;

  @Column("text", { name: "event_type" })
  eventType: string;

  @Column("jsonb", { name: "payload" })
  payload: object;

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

  @Column("timestamp with time zone", {
    name: "created_at",
    nullable: true,
    default: () => "now()",
  })
  createdAt: Date | null;

  @Column("timestamp with time zone", { name: "processed_at", nullable: true })
  processedAt: Date | null;
}
