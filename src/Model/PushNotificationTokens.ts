import { Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { Profiles } from "./Profiles";

@Index("unique_device_per_user", ["deviceId", "profileId"], { unique: true })
@Index("push_notification_tokens_pkey", ["id"], { unique: true })
@Index("push_notification_tokens_token_key", ["token"], { unique: true })
@Entity("push_notification_tokens", { schema: "public" })
export class PushNotificationTokens {
  @Column("uuid", {
    primary: true,
    name: "id",
    default: () => "gen_random_uuid()",
  })
  id: string;

  @Column("uuid", { name: "profile_id", unique: true })
  profileId: string;

  @Column("text", { name: "token", unique: true })
  token: string;

  @Column("character varying", { name: "platform", length: 10 })
  platform: string;

  @Column("text", { name: "device_id", nullable: true, unique: true })
  deviceId: string | null;

  @Column("text", { name: "device_name", nullable: true })
  deviceName: string | null;

  @Column("text", { name: "app_version", nullable: true })
  appVersion: string | null;

  @Column("boolean", {
    name: "is_active",
    nullable: true,
    default: () => "true",
  })
  isActive: boolean | null;

  @Column("timestamp with time zone", {
    name: "last_seen_at",
    nullable: true,
    default: () => "now()",
  })
  lastSeenAt: Date | null;

  @Column("timestamp with time zone", {
    name: "created_at",
    nullable: true,
    default: () => "now()",
  })
  createdAt: Date | null;

  @ManyToOne(() => Profiles, (profiles) => profiles.pushNotificationTokens, {
    onDelete: "CASCADE",
  })
  @JoinColumn([{ name: "profile_id", referencedColumnName: "id" }])
  profile: Profiles;
}
