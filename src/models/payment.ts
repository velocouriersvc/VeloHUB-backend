import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from "typeorm";
import { User } from "./user";

export enum PaymentMethodType {
    MOMO = "momo",
    CARD = "card",
    CASH = "cash",
    WALLET = "wallet",
}

export enum PaymentRecordStatus {
    PENDING = "pending",
    SUCCESS = "success",
    FAILED = "failed",
    REFUNDED = "refunded",
}

@Entity("payments")
export class Payment {
    @PrimaryGeneratedColumn("uuid")
    id: string;

    @Column({ type: "uuid", nullable: true })
    rideId: string | null;

    @Column({ type: "uuid", nullable: true })
    orderId: string | null;

    @Column({ type: "uuid", nullable: true })
    serviceBookingId: string | null;

    @Column({ type: "uuid", nullable: true })
    subscriptionId: string | null;

    @Column({ type: "uuid", nullable: true })
    scheduledRideId: string | null;

    @Column({ type: "uuid" })
    userId: string;

    @Column({ type: "decimal", precision: 10, scale: 2 })
    amount: number;

    @Column({ type: "varchar", length: 3, default: "GHS" })
    currency: string;

    @Column({ type: "enum", enum: PaymentMethodType })
    method: PaymentMethodType;

    @Column({ type: "varchar", length: 50, default: "paystack" })
    provider: string;

    @Column({ type: "varchar", length: 255, nullable: true })
    providerRef: string | null;

    @Column({ type: "varchar", length: 50, nullable: true })
    providerStatus: string | null;

    @Column({ type: "decimal", precision: 10, scale: 2 })
    platformFee: number;

    @Column({ type: "decimal", precision: 10, scale: 2 })
    driverAmount: number;

    @Column({ type: "enum", enum: PaymentRecordStatus, default: PaymentRecordStatus.PENDING })
    status: PaymentRecordStatus;

    @Column({ type: "jsonb", nullable: true })
    metadata: Record<string, any> | null;

    @CreateDateColumn()
    createdAt: Date;

    @Column({ type: "timestamp", nullable: true })
    completedAt: Date | null;

    @ManyToOne(() => User, { onDelete: "CASCADE" })
    @JoinColumn({ name: "userId" })
    user: User;
}
