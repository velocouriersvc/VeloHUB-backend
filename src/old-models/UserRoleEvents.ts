import { Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { Profiles } from "./Profiles";
import { Roles } from "./Roles";

@Index("idx_user_role_events_event_at", ["eventAt"], {})
@Index("user_role_events_pkey", ["id"], { unique: true })
@Index("idx_user_role_events_profile", ["profileId"], {})
@Index("idx_user_role_events_role", ["roleId"], {})
@Entity("user_role_events", { schema: "public" })
export class UserRoleEvents {
  @Column("uuid", {
    primary: true,
    name: "id",
    default: () => "gen_random_uuid()",
  })
  id: string;

  @Column("uuid", { name: "profile_id" })
  profileId: string;

  @Column("uuid", { name: "role_id" })
  roleId: string;

  @Column("text", { name: "event_type" })
  eventType: string;

  @Column("timestamp with time zone", {
    name: "event_at",
    default: () => "now()",
  })
  eventAt: Date;

  @ManyToOne(() => Profiles, (profiles) => profiles.userRoleEvents, {
    onDelete: "CASCADE",
  })
  @JoinColumn([{ name: "profile_id", referencedColumnName: "id" }])
  profile: Profiles;

  @ManyToOne(() => Roles, (roles) => roles.userRoleEvents)
  @JoinColumn([{ name: "role_id", referencedColumnName: "id" }])
  role: Roles;
}
