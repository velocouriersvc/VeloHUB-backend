import { Entity, PrimaryGeneratedColumn, Column, OneToMany } from "typeorm";
import { UserRole } from "./user-role";

export enum RoleType {
    BUYER = "buyer",
    DRIVER = "driver",
    MERCHANT = "merchant",
    ADMIN = "admin",
    SUPER_ADMIN = "super_admin",
    COUNTRY_MANAGER = "country_manager",
    CITY_OPERATOR = "city_operator",
    SUPPORT_AGENT = "support_agent",
    FINANCE_VIEWER = "finance_viewer",
}

@Entity("roles")
export class Role {
    @PrimaryGeneratedColumn("uuid")
    id: string;

    @Column({
        type: "enum",
        enum: RoleType,
        unique: true,
    })
    name: RoleType;

    @Column({ type: "text", nullable: true })
    description: string;

    @OneToMany(() => UserRole, (userRole: UserRole) => userRole.role)
    userRoles: UserRole[];
}
