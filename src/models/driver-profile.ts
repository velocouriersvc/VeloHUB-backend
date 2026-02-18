import { Entity, PrimaryGeneratedColumn, Column, OneToOne, JoinColumn, CreateDateColumn, UpdateDateColumn, ManyToOne } from "typeorm";
import { User } from "./user";
import { Identification } from "./identification";

export enum DriverVerificationStatus {
    PENDING = "pending",
    APPROVED = "approved",
    REJECTED = "rejected",
}

@Entity("driver_profiles")
export class DriverProfile {
    @PrimaryGeneratedColumn("uuid")
    id: string;

    @Column({ type: "uuid" })
    userId: string;

    @Column({ type: "varchar", length: 255 })
    fullName: string;

    @Column({ type: "varchar", length: 100 })
    licenseNumber: string;

    @Column({ type: "text", nullable: true })
    licensePhotoUrl: string | null;

    @Column({ type: "varchar", length: 50 })
    vehicleType: string;

    @Column({ type: "varchar", length: 20 })
    plateNumber: string;

    @Column({
        type: "enum",
        enum: DriverVerificationStatus,
        default: DriverVerificationStatus.PENDING,
    })
    status: DriverVerificationStatus;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;

    @Column({ type: "uuid", nullable: true })
    identificationId: string | null;

    @OneToOne(() => User, (user: User) => user.driverProfile, { onDelete: "CASCADE" })
    @JoinColumn({ name: "userId" })
    user: User;

    @ManyToOne(() => Identification, { nullable: true })
    @JoinColumn({ name: "identificationId" })
    identification: Identification | null;
}
