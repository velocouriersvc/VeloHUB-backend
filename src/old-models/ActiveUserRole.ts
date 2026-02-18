import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToOne,
} from "typeorm";
import { Profiles } from "./Profiles";
import { Roles } from "./Roles";

@Index("active_user_role_pkey", ["profileId"], { unique: true })
@Index("active_user_role_user_unique", ["profileId"], { unique: true })
@Entity("active_user_role", { schema: "public" })
export class ActiveUserRole {
  @Column("uuid", { primary: true, name: "profile_id" })
  profileId: string;

  @Column("timestamp with time zone", {
    name: "switched_at",
    nullable: true,
    default: () => "now()",
  })
  switchedAt: Date | null;

  @OneToOne(() => Profiles, (profiles) => profiles.activeUserRole, {
    onDelete: "CASCADE",
  })
  @JoinColumn([{ name: "profile_id", referencedColumnName: "id" }])
  profile: Profiles;

  @ManyToOne(() => Roles, (roles) => roles.activeUserRoles)
  @JoinColumn([{ name: "role_id", referencedColumnName: "id" }])
  role: Roles;
}
