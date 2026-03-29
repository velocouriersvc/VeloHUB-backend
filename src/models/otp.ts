import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from "typeorm";

@Entity("otps")
export class Otp {
    @PrimaryGeneratedColumn("uuid")
    id: string;

    @Index()
    @Column({ type: "varchar", length: 20 })
    phoneNumber: string;

    @Column({ type: "varchar", length: 6 })
    code: string;

    @Column({ type: "timestamp" })
    expiresAt: Date;

    @Column({ type: "varchar", length: 15, default: "sms" })
    channel: string; // 'sms' | 'whatsapp'

    @Column({ type: "boolean", default: false })
    isVerified: boolean;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}
