import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from "typeorm";

@Entity("zones")
export class Zone {
    @PrimaryGeneratedColumn("uuid")
    id: string;

    @Column()
    name: string;

    @Column()
    city: string;

    @Column({ default: "active" })
    status: string;

    @Column("decimal", { precision: 10, scale: 2, default: 15.00 })
    base_delivery_fee: number;

    @Column("decimal", { precision: 10, scale: 2, default: 10.00 })
    base_ride_fare: number;

    @Column("decimal", { precision: 10, scale: 2, default: 3.00 })
    per_km_rate: number;

    @Column("decimal", { precision: 10, scale: 2, default: 1.0 })
    surge_multiplier: number;

    @Column("decimal", { precision: 10, scale: 2, default: 25.00 })
    min_order_value: number;

    @Column({ default: true })
    delivery_enabled: boolean;

    @Column({ default: true })
    rides_enabled: boolean;

    @Column("float", { default: 10 })
    radius_km: number;

    @Column("decimal", { precision: 10, scale: 7, nullable: true })
    latitude: number;

    @Column("decimal", { precision: 10, scale: 7, nullable: true })
    longitude: number;

    @Column("integer", { default: 50 })
    demandLevel: number;

    @Column({ nullable: true })
    country: string;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}
