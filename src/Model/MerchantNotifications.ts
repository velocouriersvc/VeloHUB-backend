import { Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { Merchants } from "./Merchants";

@Index(
  "idx_merchant_notifications_merchant_unread",
  ["createdAt", "isRead", "merchantId"],
  {}
)
@Index("merchant_notifications_pkey", ["id"], { unique: true })
@Entity("merchant_notifications", { schema: "public" })
export class MerchantNotifications {
  @Column("uuid", {
    primary: true,
    name: "id",
    default: () => "gen_random_uuid()",
  })
  id: string;

  @Column("uuid", { name: "merchant_id" })
  merchantId: string;

  @Column("text", { name: "notification_type" })
  notificationType: string;

  @Column("text", { name: "title" })
  title: string;

  @Column("text", { name: "message" })
  message: string;

  @Column("jsonb", { name: "metadata", nullable: true })
  metadata: object | null;

  @Column("boolean", {
    name: "is_read",
    nullable: true,
    default: () => "false",
  })
  isRead: boolean | null;

  @Column("timestamp with time zone", {
    name: "created_at",
    nullable: true,
    default: () => "now()",
  })
  createdAt: Date | null;

  @Column("timestamp with time zone", { name: "read_at", nullable: true })
  readAt: Date | null;

  @ManyToOne(() => Merchants, (merchants) => merchants.merchantNotifications, {
    onDelete: "CASCADE",
  })
  @JoinColumn([{ name: "merchant_id", referencedColumnName: "id" }])
  merchant: Merchants;
}
