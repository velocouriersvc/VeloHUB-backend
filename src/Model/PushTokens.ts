import { Column, Entity, Index } from "typeorm";

@Index("push_tokens_pkey", ["id"], { unique: true })
@Index("idx_push_tokens_active", ["isActive", "userId"], {})
@Index("idx_push_tokens_token", ["token"], {})
@Index("push_tokens_token_key", ["token"], { unique: true })
@Index("idx_push_tokens_user", ["userId"], {})
@Entity("push_tokens", { schema: "public" })
export class PushTokens {
  @Column("uuid", {
    primary: true,
    name: "id",
    default: () => "gen_random_uuid()",
  })
  id: string;

  @Column("uuid", { name: "user_id" })
  userId: string;

  @Column("text", { name: "token", unique: true })
  token: string;

  @Column("text", { name: "platform" })
  platform: string;

  @Column("text", { name: "device_name", nullable: true })
  deviceName: string | null;

  @Column("boolean", {
    name: "is_active",
    nullable: true,
    default: () => "true",
  })
  isActive: boolean | null;

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

  @Column("timestamp with time zone", {
    name: "last_used_at",
    nullable: true,
    default: () => "now()",
  })
  lastUsedAt: Date | null;
}
