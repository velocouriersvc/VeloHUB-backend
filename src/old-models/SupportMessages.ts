import { Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { SupportChats } from "./SupportChats";

@Index("support_messages_pkey", ["id"], { unique: true })
@Entity("support_messages", { schema: "public" })
export class SupportMessages {
  @Column("uuid", {
    primary: true,
    name: "id",
    default: () => "gen_random_uuid()",
  })
  id: string;

  @Column("uuid", { name: "sender_id", nullable: true })
  senderId: string | null;

  @Column("text", { name: "sender_type" })
  senderType: string;

  @Column("text", { name: "content" })
  content: string;

  @Column("timestamp with time zone", {
    name: "created_at",
    nullable: true,
    default: () => "now()",
  })
  createdAt: Date | null;

  @ManyToOne(
    () => SupportChats,
    (supportChats) => supportChats.supportMessages,
    { onDelete: "CASCADE" }
  )
  @JoinColumn([{ name: "chat_id", referencedColumnName: "id" }])
  chat: SupportChats;
}
