import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from "typeorm";
import { Ride } from "./ride";

@Entity("ride_stops")
export class RideStop {
    @PrimaryGeneratedColumn("uuid")
    id: string;

    @Column({ type: "uuid" })
    rideId: string;

    @Column({ type: "text" })
    address: string;

    @Column({ type: "double precision" })
    lat: number;

    @Column({ type: "double precision" })
    lng: number;

    @Column({ type: "int" })
    stopOrder: number;

    @Column({ type: "timestamp", nullable: true })
    arrivedAt: Date | null;

    @ManyToOne(() => Ride, (ride: Ride) => ride.stops, { onDelete: "CASCADE" })
    @JoinColumn({ name: "rideId" })
    ride: Ride;
}
