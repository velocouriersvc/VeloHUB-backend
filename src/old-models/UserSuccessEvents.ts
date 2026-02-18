import { Column, Entity, Index } from "typeorm";

@Index(
  "user_success_events_user_id_domain_source_id_key",
  ["domain", "sourceId", "userId"],
  { unique: true }
)
@Index("user_success_events_pkey", ["id"], { unique: true })
@Index("idx_user_success_events_user", ["userId"], {})
@Entity("user_success_events", { schema: "public" })
export class UserSuccessEvents {
  @Column("uuid", {
    primary: true,
    name: "id",
    default: () => "gen_random_uuid()",
  })
  id: string;

  @Column("uuid", { name: "user_id", unique: true })
  userId: string;

  @Column("text", { name: "domain", unique: true })
  domain: string;

  @Column("uuid", { name: "source_id", unique: true })
  sourceId: string;

  @Column("timestamp with time zone", {
    name: "occurred_at",
    default: () => "now()",
  })
  occurredAt: Date;
}
