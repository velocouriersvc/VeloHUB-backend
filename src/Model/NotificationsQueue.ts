import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
} from "typeorm";
import { NotificationsLog } from "./NotificationsLog";
import { Profiles } from "./Profiles";

@Index("idx_notifications_queue_channel", ["channel"], {})
@Index("idx_notifications_queue_expires", ["expiresAt"], {})
@Index("notifications_queue_pkey", ["id"], { unique: true })
@Index("idx_notifications_queue_next_retry", ["nextRetryAt"], {})
@Index("idx_notifications_queue_recipient", ["recipientId"], {})
@Index("idx_notifications_queue_status", ["status"], {})
@Entity("notifications_queue", { schema: "public" })
export class NotificationsQueue {
  @Column("uuid", {
    primary: true,
    name: "id",
    default: () => "gen_random_uuid()",
  })
  id: string;

  @Column("text", { name: "channel" })
  channel: string;

  @Column("uuid", { name: "recipient_id", nullable: true })
  recipientId: string | null;

  @Column("text", { name: "recipient_phone", nullable: true })
  recipientPhone: string | null;

  @Column("text", { name: "recipient_email", nullable: true })
  recipientEmail: string | null;

  @Column("text", { name: "recipient_push_token", nullable: true })
  recipientPushToken: string | null;

  @Column("text", { name: "title" })
  title: string;

  @Column("text", { name: "body" })
  body: string;

  @Column("jsonb", { name: "data", nullable: true, default: {} })
  data: object | null;

  @Column("text", {
    name: "priority",
    nullable: true,
    default: () => "'normal'",
  })
  priority: string | null;

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
    default: () => "10",
  })
  maxRetries: number | null;

  @Column("timestamp with time zone", { name: "next_retry_at", nullable: true })
  nextRetryAt: Date | null;

  @Column("text", { name: "last_error", nullable: true })
  lastError: string | null;

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

  @Column("timestamp with time zone", { name: "sent_at", nullable: true })
  sentAt: Date | null;

  @Column("timestamp with time zone", {
    name: "expires_at",
    nullable: true,
    default: () => "(now() + '48:00:00')",
  })
  expiresAt: Date | null;

  @OneToMany(
    () => NotificationsLog,
    (notificationsLog) => notificationsLog.queue
  )
  notificationsLogs: NotificationsLog[];

  @ManyToOne(() => Profiles, (profiles) => profiles.notificationsQueues, {
    onDelete: "CASCADE",
  })
  @JoinColumn([{ name: "recipient_id", referencedColumnName: "id" }])
  recipient: Profiles;
}
