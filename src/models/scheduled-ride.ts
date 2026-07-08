import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from "typeorm";
import { VehicleType } from "./vehicle-pricing";
import { RideType } from "./ride";

export enum ScheduledRideStatus {
    SCHEDULED = "scheduled",
    DISPATCHED = "dispatched",
    CANCELLED = "cancelled",
}

export enum ScheduledPaymentStatus {
    PENDING = "pending",
    PAID = "paid",
    REFUNDED = "refunded",
    NOT_REQUIRED = "not_required",
}

@Entity("scheduled_rides")
export class ScheduledRide {
    @PrimaryGeneratedColumn("uuid")
    id: string;

    @Column({ type: "uuid" })
    customerId: string;

    @Column({ type: "enum", enum: RideType, default: RideType.RIDE })
    type: RideType;

    // Pickup
    @Column({ type: "text" })
    pickupAddress: string;

    @Column({ type: "double precision" })
    pickupLat: number;

    @Column({ type: "double precision" })
    pickupLng: number;

    // Dropoff
    @Column({ type: "text" })
    dropoffAddress: string;

    @Column({ type: "double precision" })
    dropoffLat: number;

    @Column({ type: "double precision" })
    dropoffLng: number;

    @Column({ type: "enum", enum: VehicleType })
    vehicleType: VehicleType;

    @Column({ type: "double precision", default: 0 })
    distanceKm: number;

    @Column({ type: "double precision", default: 0 })
    durationMin: number;

    @Column({ type: "timestamptz" })
    scheduledAt: Date;

    @Column({ type: "decimal", precision: 10, scale: 2, default: 0 })
    estimatedFare: number;

    @Column({ type: "varchar", length: 3, default: "GHS" })
    currency: string;

    @Column({ type: "varchar", length: 20, default: "cash" })
    paymentMethod: string;

    @Column({ type: "enum", enum: ScheduledPaymentStatus, default: ScheduledPaymentStatus.PENDING })
    paymentStatus: ScheduledPaymentStatus;

    @Column({ type: "enum", enum: ScheduledRideStatus, default: ScheduledRideStatus.SCHEDULED })
    status: ScheduledRideStatus;

    // Real ride created when the scheduled ride is dispatched
    @Column({ type: "uuid", nullable: true })
    rideId: string | null;

    @Column({ type: "text", nullable: true })
    notes: string | null;

    @CreateDateColumn({ type: "timestamptz" })
    createdAt: Date;
}
