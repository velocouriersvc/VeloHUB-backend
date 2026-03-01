import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from "typeorm";
import { User } from "./user";
import { Ride } from "./ride";

@Entity("ratings")
export class Rating {
    @PrimaryGeneratedColumn("uuid")
    id: string;

    @Column({ type: "uuid", unique: true })
    rideId: string;

    @Column({ type: "uuid" })
    driverId: string;

    @Column({ type: "uuid" })
    customerId: string;

    @Column({ type: "int" })
    rating: number;

    @Column({ type: "text", nullable: true })
    comment: string | null;

    @CreateDateColumn()
    createdAt: Date;

    @ManyToOne(() => Ride, { onDelete: "CASCADE" })
    @JoinColumn({ name: "rideId" })
    ride: Ride;

    @ManyToOne(() => User)
    @JoinColumn({ name: "driverId" })
    driver: User;

    @ManyToOne(() => User)
    @JoinColumn({ name: "customerId" })
    customer: User;
}
