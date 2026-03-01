import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from "typeorm";
import { Ride } from "./ride";

@Entity("ride_shared_contacts")
export class RideSharedContact {
    @PrimaryGeneratedColumn("uuid")
    id: string;

    @Column({ type: "uuid" })
    rideId: string;

    @Column({ type: "varchar", length: 255 })
    name: string;

    @Column({ type: "varchar", length: 20 })
    phone: string;

    @Column({ type: "boolean", default: false })
    notified: boolean;

    @ManyToOne(() => Ride, (ride: Ride) => ride.sharedContacts, { onDelete: "CASCADE" })
    @JoinColumn({ name: "rideId" })
    ride: Ride;
}
