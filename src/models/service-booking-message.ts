import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn, Index } from "typeorm";
import { ServiceBooking } from "./service-booking";

/**
 * One message in a booking conversation between the customer and the provider.
 * Mirrors the ride_messages pattern (REST-first, push-notified).
 */
@Entity("service_booking_messages")
export class ServiceBookingMessage {
    @PrimaryGeneratedColumn("uuid")
    id: string;

    @Index()
    @Column({ type: "uuid" })
    bookingId: string;

    @ManyToOne(() => ServiceBooking, { onDelete: "CASCADE" })
    @JoinColumn({ name: "bookingId" })
    booking: ServiceBooking;

    @Column({ type: "uuid" })
    senderId: string;

    @Column({ type: "varchar", length: 10 })
    senderRole: "customer" | "provider";

    @Column({ type: "text" })
    text: string;

    @CreateDateColumn()
    createdAt: Date;
}
