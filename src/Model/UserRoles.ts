import { Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { Profiles } from "./Profiles";

@Index("user_roles_pkey", ["id"], { unique: true })
@Index("idx_user_roles_active", ["isActive", "profileId"], {})
@Index("user_roles_profile_id_role_key", ["profileId", "role"], {
  unique: true,
})
@Entity("user_roles", { schema: "public" })
export class UserRoles {
  @Column("uuid", {
    primary: true,
    name: "id",
    default: () => "gen_random_uuid()",
  })
  id: string;

  @Column("uuid", { name: "profile_id", nullable: true, unique: true })
  profileId: string | null;

  @Column("text", { name: "role", unique: true })
  role: string;

  @Column("boolean", {
    name: "is_active",
    nullable: true,
    default: () => "false",
  })
  isActive: boolean | null;

  @Column("boolean", {
    name: "profile_complete",
    nullable: true,
    default: () => "false",
  })
  profileComplete: boolean | null;

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

  @ManyToOne(() => Profiles, (profiles) => profiles.userRoles, {
    onDelete: "CASCADE",
  })
  @JoinColumn([{ name: "profile_id", referencedColumnName: "id" }])
  profile: Profiles;
}
