import { Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { Profiles } from "./Profiles";
import { Roles } from "./Roles";

@Index("user_roles_pkey", ["profileId", "roleId"], { unique: true })
@Index("idx_user_roles_profile_id", ["profileId"], {})
@Index("user_roles_unique", ["profileId", "roleId"], { unique: true })
@Index("idx_user_roles_role_id", ["roleId"], {})
@Entity("user_roles", { schema: "public" })
export class UserRoles {
  @Column("uuid", { primary: true, name: "profile_id" })
  profileId: string;

  @Column("uuid", { primary: true, name: "role_id" })
  roleId: string;

  @Column("boolean", {
    name: "completed_requirements",
    nullable: true,
    default: () => "false",
  })
  completedRequirements: boolean | null;

  @Column("timestamp with time zone", {
    name: "assigned_at",
    nullable: true,
    default: () => "now()",
  })
  assignedAt: Date | null;

  @ManyToOne(() => Profiles, (profiles) => profiles.userRoles, {
    onDelete: "CASCADE",
  })
  @JoinColumn([{ name: "profile_id", referencedColumnName: "id" }])
  profile: Profiles;

  @ManyToOne(() => Roles, (roles) => roles.userRoles, { onDelete: "CASCADE" })
  @JoinColumn([{ name: "role_id", referencedColumnName: "id" }])
  role: Roles;
}
