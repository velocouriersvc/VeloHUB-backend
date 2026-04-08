import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, DeleteDateColumn, OneToMany, OneToOne } from "typeorm";
import { UserRole } from "./user-role";
import { BuyerProfile } from "./buyer-profile";
import { DriverProfile } from "./driver-profile";
import { MerchantProfile } from "./merchant-profile";
import { UserProfile } from "./user-profile";

export enum UserStatus {
    ACTIVE = "active",
    INACTIVE = "inactive",
    SUSPENDED = "suspended",
    BANNED = "banned",
}

@Entity("users")
export class User {
    @Column({ type: "text", primary: true })
    id: string;

    @Column({ type: "varchar", length: 20, unique: true, nullable: true })
    phoneNumber: string | null;

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

    @Column({ type: "varchar", length: 2, default: "GH" })
    country: string;

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

    @OneToOne(() => UserProfile, (profile: UserProfile) => profile.user)
    userProfile: UserProfile;
}
