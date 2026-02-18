import { Column, Entity, Index } from "typeorm";

@Index("outbox_events_pkey", ["id"], { unique: true })
@Entity("outbox_events", { schema: "public" })
export class OutboxEvents {
  @Column("uuid", {
    primary: true,
    name: "id",
    default: () => "gen_random_uuid()",
  })
  id: string;

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
    default: () => "3",
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

  @Column("text", { name: "aggregate_type", nullable: true })
  aggregateType: string | null;

  @Column("text", { name: "aggregate_id", nullable: true })
  aggregateId: string | null;
}
