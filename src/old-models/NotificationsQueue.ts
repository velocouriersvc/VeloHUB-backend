import { Column, Entity, Index, PrimaryGeneratedColumn } from "typeorm";

@Index("notifications_queue_pkey", ["id"], { unique: true })
@Entity("notifications_queue", { schema: "public" })
export class NotificationsQueue {
  @PrimaryGeneratedColumn({ type: "bigint", name: "id" })
  id: string;

  @Column("text", { name: "channel" })
  channel: string;

  @Column("uuid", { name: "recipient_id", nullable: true })
  recipientId: string | null;

  @Column("text", { name: "title", nullable: true })
  title: string | null;

  @Column("text", { name: "body", nullable: true })
  body: string | null;

  @Column("jsonb", { name: "data", nullable: true })
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

  @Column("timestamp with time zone", { name: "expires_at", nullable: true })
  expiresAt: Date | null;

  @Column("timestamp with time zone", {
    name: "created_at",
    nullable: true,
    default: () => "now()",
  })
  createdAt: Date | null;
}
