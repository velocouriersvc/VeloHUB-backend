import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from "typeorm";

export type RideMessageSender = "customer" | "driver";

@Entity("ride_messages")
export class RideMessage {
    @PrimaryGeneratedColumn("uuid")
    id: string;

    @Index()
    @Column({ type: "uuid" })
    rideId: string;

    @Column({ type: "text" })
    senderId: string;

    @Column({ type: "varchar", length: 10 })
    senderRole: RideMessageSender;

    @Column({ type: "text" })
    text: string;

    @CreateDateColumn()
    createdAt: Date;
}
