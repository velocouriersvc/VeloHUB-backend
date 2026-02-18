import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, DeleteDateColumn, OneToMany, OneToOne } from "typeorm";
import { UserRole } from "./user-role.js";
import { BuyerProfile } from "./buyer-profile.js";
import { DriverProfile } from "./driver-profile.js";
import { MerchantProfile } from "./merchant-profile.js";

export enum UserStatus {
    ACTIVE = "active",
    INACTIVE = "inactive",
    SUSPENDED = "suspended",
    BANNED = "banned",
}

@Entity("users")
export class User {
    @PrimaryGeneratedColumn("uuid")
    id: string;

    @Column({ type: "varchar", length: 20, unique: true })
    phoneNumber: string;

    @Column({ type: "varchar", length: 255, nullable: true, unique: true })
    email: string | null;

    @Column({
        type: "enum",
        enum: UserStatus,
        default: UserStatus.ACTIVE,
    })
    status: UserStatus;

    @Column({ type: "varchar", length: 20, nullable: true })
    activeRole: string | null;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;

    @DeleteDateColumn()
    deletedAt: Date | null;

    @Column({ type: "timestamp", nullable: true })
    lastLoginAt: Date | null;

    @OneToMany(() => UserRole, (userRole: UserRole) => userRole.user)
    userRoles: UserRole[];

    @OneToOne(() => BuyerProfile, (profile: BuyerProfile) => profile.user)
    buyerProfile: BuyerProfile;

    @OneToOne(() => DriverProfile, (profile: DriverProfile) => profile.user)
    driverProfile: DriverProfile;

    @OneToOne(() => MerchantProfile, (profile: MerchantProfile) => profile.user)
    merchantProfile: MerchantProfile;
}
