import { Entity, PrimaryGeneratedColumn, Column, UpdateDateColumn } from "typeorm";

export enum VehicleType {
    BIKE = "bike",
    CAR = "car",
    SUV = "suv",
    TRUCK = "truck",
}

@Entity("vehicle_pricing")
export class VehiclePricing {
    @PrimaryGeneratedColumn("uuid")
    id: string;

    @Column({ type: "enum", enum: VehicleType, unique: true })
    vehicleType: VehicleType;

    @Column({ type: "decimal", precision: 8, scale: 2 })
    basePriceCedis: number;

    @Column({ type: "decimal", precision: 8, scale: 2 })
    pricePerKm: number;

    @Column({ type: "decimal", precision: 8, scale: 2 })
    pricePerMin: number;

    @Column({ type: "decimal", precision: 8, scale: 2 })
    minimumFare: number;

    @Column({ type: "int" })
    maxPassengers: number;

    @Column({ type: "boolean", default: true })
    isActive: boolean;

    @UpdateDateColumn()
    updatedAt: Date;
}
