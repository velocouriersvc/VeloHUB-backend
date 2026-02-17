import { Column, Entity, Index, OneToMany } from "typeorm";
import { SupportMessages } from "./SupportMessages";

@Index("support_chats_pkey", ["id"], { unique: true })
@Entity("support_chats", { schema: "public" })
export class SupportChats {
  @Column("uuid", {
    primary: true,
    name: "id",
    default: () => "gen_random_uuid()",
  })
  id: string;

  @Column("uuid", { name: "user_id" })
  userId: string;

  @Column("text", { name: "subject", nullable: true })
  subject: string | null;

  @Column("text", { name: "status", nullable: true, default: () => "'open'" })
  status: string | null;

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

  @OneToMany(() => SupportMessages, (supportMessages) => supportMessages.chat)
  supportMessages: SupportMessages[];
}
