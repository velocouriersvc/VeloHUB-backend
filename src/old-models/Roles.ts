import { Column, Entity, Index, OneToMany } from "typeorm";
import { ActiveUserRole } from "./ActiveUserRole";
import { RideBookings } from "./RideBookings";
import { UserRoleEvents } from "./UserRoleEvents";
import { UserRoles } from "./UserRoles";

@Index("roles_pkey", ["id"], { unique: true })
@Index("idx_roles_name", ["name"], {})
@Index("roles_name_key", ["name"], { unique: true })
@Index("roles_name_unique", ["name"], { unique: true })
@Entity("roles", { schema: "public" })
export class Roles {
  @Column("uuid", {
    primary: true,
    name: "id",
    default: () => "gen_random_uuid()",
  })
  id: string;

  @Column("character varying", { name: "name", length: 20 })
  name: string;

  @Column("text", { name: "description", nullable: true })
  description: string | null;

  @OneToMany(() => ActiveUserRole, (activeUserRole) => activeUserRole.role)
  activeUserRoles: ActiveUserRole[];

  @OneToMany(() => RideBookings, (rideBookings) => rideBookings.cancelledByRole)
  rideBookings: RideBookings[];

  @OneToMany(() => UserRoleEvents, (userRoleEvents) => userRoleEvents.role)
  userRoleEvents: UserRoleEvents[];

  @OneToMany(() => UserRoles, (userRoles) => userRoles.role)
  userRoles: UserRoles[];
}
