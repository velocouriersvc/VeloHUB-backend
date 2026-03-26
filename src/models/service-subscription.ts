import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from "typeorm";
import { User } from "./user";

export enum ServiceSubscriptionStatus {
    ACTIVE = "active",
    PENDING = "pending",
    CANCELLED = "cancelled",
    EXPIRED = "expired",
}

@Entity("service_subscriptions")
export class ServiceSubscription {
    @PrimaryGeneratedColumn("uuid")
    id: string;

    @Column({ type: "uuid" })
    userId: string;

    @Column({
        type: "enum",
        enum: ServiceSubscriptionStatus,
        default: ServiceSubscriptionStatus.PENDING,
    })
    status: ServiceSubscriptionStatus;

    @Column({ type: "timestamp", nullable: true })
    currentPeriodStart: Date | null;

    @Column({ type: "timestamp", nullable: true })
    currentPeriodEnd: Date | null;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;

    @ManyToOne(() => User, { onDelete: "CASCADE" })
    @JoinColumn({ name: "userId" })
    user: User;
}
