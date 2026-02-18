import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from "typeorm";

export enum IdentificationStatus {
    PENDING = "pending",
    VERIFIED = "verified",
    REJECTED = "rejected",
    EXPIRED = "expired",
}

@Entity("identifications")
export class Identification {
    @PrimaryGeneratedColumn("uuid")
    id: string;

    @Column({ type: "varchar", length: 100 })
    type: string; // e.g., 'Ghana Card', 'Passport', 'Driver License'

    @Column({ type: "varchar", length: 100, unique: true })
    idNumber: string;

    @Column({ type: "varchar", length: 3 })
    issuingCountry: string; // ISO 3166-1 alpha-3 code (e.g., 'GHA')

    @Column({ type: "text" })
    frontUrl: string;

    @Column({ type: "text", nullable: true })
    backUrl: string | null;

    @Column({ type: "timestamp", nullable: true })
    expiryDate: Date | null;

    @Column({
        type: "enum",
        enum: IdentificationStatus,
        default: IdentificationStatus.PENDING,
    })
    status: IdentificationStatus;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}
