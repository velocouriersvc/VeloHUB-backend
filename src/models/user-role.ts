import { Entity, Column, ManyToOne, JoinColumn, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn } from "typeorm";
import { User } from "./user";
import { Role } from "./role";

export enum RoleStatus {
    PENDING = "pending",
    APPROVED = "approved",
    REJECTED = "rejected",
    SUSPENDED = "suspended",
}

@Entity("user_roles")
export class UserRole {
    @PrimaryGeneratedColumn("uuid")
    id: string;

    @Column({ type: "uuid" })
    userId: string;

    @Column({ type: "uuid" })
    roleId: string;

    @Column({
        type: "enum",
        enum: RoleStatus,
        default: RoleStatus.PENDING,
    })
    status: RoleStatus;

    @Column({ type: "boolean", default: false })
    completedRequirements: boolean;

    @Column({ type: "simple-json", nullable: true })
    allowedCountries: string[];

    @Column({ type: "simple-json", nullable: true })
    allowedCities: string[];

    @CreateDateColumn()
    assignedAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;

    @ManyToOne(() => User, (user: User) => user.userRoles, { onDelete: "CASCADE" })
    @JoinColumn({ name: "userId" })
    user: User;

    @ManyToOne(() => Role, (role: Role) => role.userRoles, { onDelete: "CASCADE" })
    @JoinColumn({ name: "roleId" })
    role: Role;
}
