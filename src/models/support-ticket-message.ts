import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn, Index } from "typeorm";
import { SupportTicket } from "./support-ticket";

/**
 * One message in a support ticket conversation. Support and the user go back
 * and forth until the ticket is resolved or closed.
 */
@Entity("support_ticket_messages")
export class SupportTicketMessage {
    @PrimaryGeneratedColumn("uuid")
    id: string;

    @Index()
    @Column({ type: "uuid" })
    ticketId: string;

    @ManyToOne(() => SupportTicket, { onDelete: "CASCADE" })
    @JoinColumn({ name: "ticketId" })
    ticket: SupportTicket;

    @Column({ type: "uuid" })
    senderId: string;

    @Column({ type: "varchar", length: 10 })
    senderRole: "user" | "admin";

    @Column({ type: "text" })
    message: string;

    @CreateDateColumn()
    createdAt: Date;
}
