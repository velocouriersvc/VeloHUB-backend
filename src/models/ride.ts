import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn, OneToMany } from "typeorm";
import { User } from "./user";
import { PromoCode } from "./promo-code";
import { RideStop } from "./ride-stop";
import { RideSharedContact } from "./ride-shared-contact";
import { VehicleType } from "./vehicle-pricing";

export enum RideType {
    RIDE = "ride",
    DELIVERY = "delivery",
}

export enum PaymentMethod {
    MOMO = "momo",
    CASH = "cash",
    WALLET = "wallet",
}

export enum PaymentStatus {
    PENDING = "pending",
    PAID = "paid",
    FAILED = "failed",
    REFUNDED = "refunded",
}

export enum RideStatus {
    SEARCHING = "searching",
    ACCEPTED = "accepted",
    AWAITING_PAYMENT = "awaiting_payment",
    PAID = "paid",
    DRIVER_ENROUTE = "driver_enroute",
    ARRIVED = "arrived",
    ONGOING = "ongoing",
    COMPLETED = "completed",
    CANCELLED = "cancelled",
}

export enum CancelledBy {
    CUSTOMER = "customer",
    DRIVER = "driver",
    SYSTEM = "system",
}

@Entity("rides")
export class Ride {
    @PrimaryGeneratedColumn("uuid")
    id: string;

    @Column({ type: "uuid" })
    customerId: string;

    @Column({ type: "uuid", nullable: true })
    driverId: string | null;

    @Column({ type: "enum", enum: RideType })
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

    // Vehicle
    @Column({ type: "enum", enum: VehicleType })
    vehicleType: VehicleType;

    // Currency
    @Column({ type: "varchar", length: 3, default: "GHS" })
    currency: string;

    // Distance & Duration
    @Column({ type: "decimal", precision: 8, scale: 2 })
    distanceKm: number;

    @Column({ type: "decimal", precision: 8, scale: 2 })
    durationMin: number;

    // Fare breakdown
    @Column({ type: "decimal", precision: 10, scale: 2 })
    baseFare: number;

    @Column({ type: "decimal", precision: 10, scale: 2 })
    subtotal: number;

    @Column({ type: "decimal", precision: 3, scale: 2, default: 1.0 })
    surgeMultiplier: number;

    @Column({ type: "decimal", precision: 10, scale: 2, default: 0 })
    surgeAmount: number;

    @Column({ type: "decimal", precision: 5, scale: 2, default: 0 })
    discountPercent: number;

    @Column({ type: "decimal", precision: 10, scale: 2, default: 0 })
    discountAmount: number;

    @Column({ type: "decimal", precision: 10, scale: 2, default: 0 })
    finalFare: number;

    @Column({ type: "decimal", precision: 10, scale: 2, default: 0 })
    commission: number;

    @Column({ type: "decimal", precision: 10, scale: 2, default: 0 })
    driverPayout: number;

    @Column({ type: "uuid", nullable: true })
    promoCodeId: string | null;

    // Payment
    @Column({ type: "enum", enum: PaymentMethod, nullable: true })
    paymentMethod: PaymentMethod | null;

    @Column({ type: "enum", enum: PaymentStatus, default: PaymentStatus.PENDING })
    paymentStatus: PaymentStatus;

    // Status
    @Column({ type: "enum", enum: RideStatus, default: RideStatus.SEARCHING })
    status: RideStatus;

    @Column({ type: "enum", enum: CancelledBy, nullable: true })
    cancelledBy: CancelledBy | null;

    @Column({ type: "text", nullable: true })
    cancelReason: string | null;

    @Column({ type: "int", default: 1 })
    passengerCount: number;

    @Column({ type: "int", default: 15 })
    searchRadiusKm: number;

    // Timestamps
    @CreateDateColumn()
    createdAt: Date;

    @Column({ type: "timestamp", nullable: true })
    acceptedAt: Date | null;

    @Column({ type: "timestamp", nullable: true })
    paidAt: Date | null;

    @Column({ type: "timestamp", nullable: true })
    startedAt: Date | null;

    @Column({ type: "timestamp", nullable: true })
    completedAt: Date | null;

    @Column({ type: "timestamp", nullable: true })
    cancelledAt: Date | null;

    // Relations
    @ManyToOne(() => User, { onDelete: "CASCADE" })
    @JoinColumn({ name: "customerId" })
    customer: User;

    @ManyToOne(() => User, { nullable: true })
    @JoinColumn({ name: "driverId" })
    driver: User | null;

    @ManyToOne(() => PromoCode, { nullable: true })
    @JoinColumn({ name: "promoCodeId" })
    promoCode: PromoCode | null;

    @OneToMany(() => RideStop, (stop: RideStop) => stop.ride)
    stops: RideStop[];

    @OneToMany(() => RideSharedContact, (contact: RideSharedContact) => contact.ride)
    sharedContacts: RideSharedContact[];
}
