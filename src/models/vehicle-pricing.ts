import { Entity, PrimaryGeneratedColumn, Column, UpdateDateColumn, Unique } from "typeorm";

export enum VehicleType {
    BIKE = "bike",
    CAR = "car",
    PRIORITY = "priority",
    SUV = "suv",
    TRUCK = "truck",
}

@Entity("vehicle_pricing")
@Unique(["vehicleType", "country"])
export class VehiclePricing {
    @PrimaryGeneratedColumn("uuid")
    id: string;

    @Column({ type: "enum", enum: VehicleType })
    vehicleType: VehicleType;

    @Column({ type: "varchar", length: 2, default: "GH" })
    country: string;

    @Column({ type: "decimal", precision: 8, scale: 2 })
    basePrice: number;

    @Column({ type: "decimal", precision: 8, scale: 2 })
    pricePerKm: number;

    @Column({ type: "decimal", precision: 8, scale: 2 })
    pricePerMin: number;

    @Column({ type: "decimal", precision: 8, scale: 2 })
    minimumFare: number;

    /** Flat booking fee added to every fare (helps compensate drivers). */
    @Column({ type: "decimal", precision: 8, scale: 2, default: 0 })
    bookingFee: number;

    @Column({ type: "decimal", precision: 8, scale: 2, default: 1.99 })
    riderServiceFee: number;

    @Column({ type: "int" })
    maxPassengers: number;

    @Column({ type: "boolean", default: true })
    isActive: boolean;

    @UpdateDateColumn()
    updatedAt: Date;
}
