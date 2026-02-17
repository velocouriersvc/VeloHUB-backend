import { Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { NotificationsQueue } from "./NotificationsQueue";
import { Profiles } from "./Profiles";

@Index("idx_notifications_log_created", ["createdAt"], {})
@Index("notifications_log_pkey", ["id"], { unique: true })
@Index("idx_notifications_log_queue_id", ["queueId"], {})
@Index("idx_notifications_log_status", ["status"], {})
@Entity("notifications_log", { schema: "public" })
export class NotificationsLog {
  @Column("uuid", {
    primary: true,
    name: "id",
    default: () => "gen_random_uuid()",
  })
  id: string;

  @Column("uuid", { name: "queue_id", nullable: true })
  queueId: string | null;

  @Column("text", { name: "channel" })
  channel: string;

  @Column("text", { name: "status" })
  status: string;

  @Column("text", { name: "error_message", nullable: true })
  errorMessage: string | null;

  @Column("integer", {
    name: "retry_attempt",
    nullable: true,
    default: () => "0",
  })
  retryAttempt: number | null;

  @Column("jsonb", { name: "provider_response", nullable: true })
  providerResponse: object | null;

  @Column("timestamp with time zone", {
    name: "created_at",
    nullable: true,
    default: () => "now()",
  })
  createdAt: Date | null;

  @ManyToOne(
    () => NotificationsQueue,
    (notificationsQueue) => notificationsQueue.notificationsLogs,
    { onDelete: "CASCADE" }
  )
  @JoinColumn([{ name: "queue_id", referencedColumnName: "id" }])
  queue: NotificationsQueue;

  @ManyToOne(() => Profiles, (profiles) => profiles.notificationsLogs, {
    onDelete: "SET NULL",
  })
  @JoinColumn([{ name: "recipient_id", referencedColumnName: "id" }])
  recipient: Profiles;
}
