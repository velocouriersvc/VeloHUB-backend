import { Entity, PrimaryGeneratedColumn, Column, UpdateDateColumn, OneToOne, JoinColumn } from "typeorm";
import { User } from "./user";

@Entity("driver_stats")
export class DriverStats {
    @PrimaryGeneratedColumn("uuid")
    id: string;

    @Column({ type: "uuid", unique: true })
    driverId: string;

    @Column({ type: "int", default: 0 })
    totalRides: number;

    @Column({ type: "decimal", precision: 12, scale: 2, default: 0 })
    totalEarnings: number;

    @Column({ type: "decimal", precision: 3, scale: 2, default: 0 })
    averageRating: number;

    @Column({ type: "int", default: 0 })
    ratingCount: number;

    @UpdateDateColumn()
    updatedAt: Date;

    @OneToOne(() => User, { onDelete: "CASCADE" })
    @JoinColumn({ name: "driverId" })
    driver: User;
}
