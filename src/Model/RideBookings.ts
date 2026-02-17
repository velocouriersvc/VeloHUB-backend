import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
} from "typeorm";
import { EmergencyNotifications } from "./EmergencyNotifications";
import { BuyerInformation } from "./BuyerInformation";
import { Profiles } from "./Profiles";
import { Roles } from "./Roles";
import { Drivers } from "./Drivers";
import { RideRequestNotifications } from "./RideRequestNotifications";

@Index("idx_bookings_buyer", ["buyerId"], {})
@Index("idx_bookings_created", ["createdAt"], {})
@Index("idx_bookings_driver", ["driverId"], {})
@Index("idx_bookings_dropoff_point", ["dropoffPoint"], {})
@Index("ride_bookings_pkey", ["id"], { unique: true })
@Index("idx_bookings_pickup_point", ["pickupPoint"], {})
@Index("idx_bookings_status", ["status"], {})
@Entity("ride_bookings", { schema: "public" })
export class RideBookings {
  @Column("uuid", {
    primary: true,
    name: "id",
    default: () => "gen_random_uuid()",
  })
  id: string;

  @Column("uuid", { name: "buyer_id" })
  buyerId: string;

  @Column("uuid", { name: "driver_id", nullable: true })
  driverId: string | null;

  @Column("text", { name: "pickup_address" })
  pickupAddress: string;

  @Column("numeric", { name: "pickup_lat", precision: 10, scale: 8 })
  pickupLat: string;

  @Column("numeric", { name: "pickup_lng", precision: 11, scale: 8 })
  pickupLng: string;

  @Column("text", { name: "dropoff_address" })
  dropoffAddress: string;

  @Column("numeric", { name: "dropoff_lat", precision: 10, scale: 8 })
  dropoffLat: string;

  @Column("numeric", { name: "dropoff_lng", precision: 11, scale: 8 })
  dropoffLng: string;

  @Column("geography", { name: "pickup_point", nullable: true })
  pickupPoint: string | null;

  @Column("geography", { name: "dropoff_point", nullable: true })
  dropoffPoint: string | null;

  @Column("enum", {
    name: "ride_type",
    nullable: true,
    enum: ["standard", "premium", "xl"],
    default: () => "'standard'",
  })
  rideType: "standard" | "premium" | "xl" | null;

  @Column("numeric", {
    name: "estimated_distance",
    nullable: true,
    precision: 10,
    scale: 2,
  })
  estimatedDistance: string | null;

  @Column("integer", { name: "estimated_duration", nullable: true })
  estimatedDuration: number | null;

  @Column("numeric", {
    name: "estimated_fare",
    nullable: true,
    precision: 10,
    scale: 2,
  })
  estimatedFare: string | null;

  @Column("numeric", {
    name: "actual_distance",
    nullable: true,
    precision: 10,
    scale: 2,
  })
  actualDistance: string | null;

  @Column("integer", { name: "actual_duration", nullable: true })
  actualDuration: number | null;

  @Column("numeric", {
    name: "final_fare",
    nullable: true,
    precision: 10,
    scale: 2,
  })
  finalFare: string | null;

  @Column("enum", {
    name: "status",
    nullable: true,
    enum: [
      "pending",
      "searching",
      "accepted",
      "driver_arrived",
      "in_progress",
      "completed",
      "cancelled",
      "confirmed",
      "awaiting_confirmation",
      "arrived",
      "picked_up",
      "in_transit",
    ],
    default: () => "'pending'",
  })
  status:
    | "pending"
    | "searching"
    | "accepted"
    | "driver_arrived"
    | "in_progress"
    | "completed"
    | "cancelled"
    | "confirmed"
    | "awaiting_confirmation"
    | "arrived"
    | "picked_up"
    | "in_transit"
    | null;

  @Column("timestamp with time zone", { name: "scheduled_for", nullable: true })
  scheduledFor: Date | null;

  @Column("timestamp with time zone", { name: "accepted_at", nullable: true })
  acceptedAt: Date | null;

  @Column("timestamp with time zone", {
    name: "pickup_arrived_at",
    nullable: true,
  })
  pickupArrivedAt: Date | null;

  @Column("timestamp with time zone", { name: "started_at", nullable: true })
  startedAt: Date | null;

  @Column("timestamp with time zone", { name: "completed_at", nullable: true })
  completedAt: Date | null;

  @Column("timestamp with time zone", { name: "cancelled_at", nullable: true })
  cancelledAt: Date | null;

  @Column("text", { name: "cancellation_reason", nullable: true })
  cancellationReason: string | null;

  @Column("character varying", {
    name: "payment_method",
    nullable: true,
    length: 50,
  })
  paymentMethod: string | null;

  @Column("enum", {
    name: "payment_status",
    nullable: true,
    enum: [
      "pending",
      "held",
      "completed",
      "refunded",
      "initiated",
      "successful",
      "failed",
    ],
    default: () => "'pending'",
  })
  paymentStatus:
    | "pending"
    | "held"
    | "completed"
    | "refunded"
    | "initiated"
    | "successful"
    | "failed"
    | null;

  @Column("numeric", {
    name: "tip_amount",
    nullable: true,
    precision: 10,
    scale: 2,
    default: () => "0.00",
  })
  tipAmount: string | null;

  @Column("boolean", {
    name: "emergency_shared",
    nullable: true,
    default: () => "false",
  })
  emergencyShared: boolean | null;

  @Column("boolean", {
    name: "emergency_contacts_notified",
    nullable: true,
    default: () => "false",
  })
  emergencyContactsNotified: boolean | null;

  @Column("timestamp with time zone", {
    name: "created_at",
    nullable: true,
    default: () => "now()",
  })
  createdAt: Date | null;

  @Column("timestamp with time zone", {
    name: "updated_at",
    nullable: true,
    default: () => "now()",
  })
  updatedAt: Date | null;

  @Column("numeric", {
    name: "driver_current_lat",
    nullable: true,
    precision: 10,
    scale: 8,
  })
  driverCurrentLat: string | null;

  @Column("numeric", {
    name: "driver_current_lng",
    nullable: true,
    precision: 11,
    scale: 8,
  })
  driverCurrentLng: string | null;

  @Column("timestamp with time zone", {
    name: "arrived_at_pickup_at",
    nullable: true,
  })
  arrivedAtPickupAt: Date | null;

  @OneToMany(
    () => EmergencyNotifications,
    (emergencyNotifications) => emergencyNotifications.ride
  )
  emergencyNotifications: EmergencyNotifications[];

  @ManyToOne(
    () => BuyerInformation,
    (buyerInformation) => buyerInformation.rideBookings,
    { onDelete: "CASCADE" }
  )
  @JoinColumn([{ name: "buyer_id", referencedColumnName: "id" }])
  buyer: BuyerInformation;

  @ManyToOne(() => Profiles, (profiles) => profiles.rideBookings, {
    onDelete: "CASCADE",
  })
  @JoinColumn([{ name: "buyer_id", referencedColumnName: "id" }])
  buyer_2: Profiles;

  @ManyToOne(() => Profiles, (profiles) => profiles.rideBookings2)
  @JoinColumn([{ name: "cancelled_by", referencedColumnName: "id" }])
  cancelledBy: Profiles;

  @ManyToOne(() => Roles, (roles) => roles.rideBookings)
  @JoinColumn([{ name: "cancelled_by_role_id", referencedColumnName: "id" }])
  cancelledByRole: Roles;

  @ManyToOne(() => Drivers, (drivers) => drivers.rideBookings, {
    onDelete: "SET NULL",
  })
  @JoinColumn([{ name: "driver_id", referencedColumnName: "id" }])
  driver: Drivers;

  @ManyToOne(() => Profiles, (profiles) => profiles.rideBookings3, {
    onDelete: "SET NULL",
  })
  @JoinColumn([{ name: "driver_id", referencedColumnName: "id" }])
  driver_2: Profiles;

  @OneToMany(
    () => RideRequestNotifications,
    (rideRequestNotifications) => rideRequestNotifications.rideRequest
  )
  rideRequestNotifications: RideRequestNotifications[];
}
