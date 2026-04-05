import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from "typeorm";
import { User } from "./user";

export enum SupportTicketStatus {
    OPEN = "open",
    IN_PROGRESS = "in_progress",
    RESOLVED = "resolved",
    CLOSED = "closed",
}

export enum SupportTicketPriority {
    LOW = "low",
    MEDIUM = "medium",
    HIGH = "high",
    URGENT = "urgent",
}

@Entity("support_tickets")
export class SupportTicket {
    @PrimaryGeneratedColumn("uuid")
    id: string;

    @Column({ type: "varchar", length: 20, unique: true, nullable: true })
    ticket_number: string;

    @Column({ type: "uuid" })
    userId: string;

    @Column({ type: "varchar", length: 255 })
    subject: string;

    @Column({ type: "text" })
    description: string;

    @Column({ type: "varchar", length: 50, nullable: true })
    category: string;

    @Column({ type: "enum", enum: SupportTicketPriority, default: SupportTicketPriority.MEDIUM })
    priority: SupportTicketPriority;

    @Column({ type: "enum", enum: SupportTicketStatus, default: SupportTicketStatus.OPEN })
    status: SupportTicketStatus;

    @Column({ type: "text", nullable: true })
    resolution: string;

    @Column({ type: "decimal", precision: 10, scale: 2, nullable: true })
    refund_amount: number;

    @Column({ type: "uuid", nullable: true })
    order_id: string;

    @CreateDateColumn()
    created_date: Date;

    @UpdateDateColumn()
    updated_date: Date;

    @ManyToOne(() => User, { onDelete: "CASCADE" })
    @JoinColumn({ name: "userId" })
    user: User;
}
