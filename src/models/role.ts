import { Entity, PrimaryGeneratedColumn, Column, OneToMany } from "typeorm";
import { UserRole } from "./user-role";

export enum RoleType {
    BUYER = "buyer",
    DRIVER = "driver",
    MERCHANT = "merchant",
    ADMIN = "admin",
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
