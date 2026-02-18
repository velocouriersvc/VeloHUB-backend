import { Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { Drivers } from "./Drivers";
import { Rides } from "./Rides";

@Index("unique_ride_driver", ["driverId", "rideId"], { unique: true })
@Index("ride_requests_pkey", ["id"], { unique: true })
@Entity("ride_requests", { schema: "public" })
export class RideRequests {
  @Column("uuid", {
    primary: true,
    name: "id",
    default: () => "gen_random_uuid()",
  })
  id: string;

  @Column("uuid", { name: "ride_id", unique: true })
  rideId: string;

  @Column("uuid", { name: "driver_id", unique: true })
  driverId: string;

  @Column("text", { name: "status", default: () => "'pending'" })
  status: string;

  @Column("timestamp with time zone", {
    name: "requested_at",
    nullable: true,
    default: () => "now()",
  })
  requestedAt: Date | null;

  @Column("timestamp with time zone", { name: "responded_at", nullable: true })
  respondedAt: Date | null;

  @Column("character varying", {
    name: "pickup_otp",
    nullable: true,
    length: 6,
  })
  pickupOtp: string | null;

  @Column("character varying", {
    name: "delivery_otp",
    nullable: true,
    length: 6,
  })
  deliveryOtp: string | null;

  @Column("boolean", {
    name: "pickup_verified",
    nullable: true,
    default: () => "false",
  })
  pickupVerified: boolean | null;

  @Column("boolean", {
    name: "delivery_verified",
    nullable: true,
    default: () => "false",
  })
  deliveryVerified: boolean | null;

  @Column("timestamp with time zone", {
    name: "driver_arrived_at",
    nullable: true,
  })
  driverArrivedAt: Date | null;

  @Column("timestamp with time zone", {
    name: "pickup_verified_at",
    nullable: true,
  })
  pickupVerifiedAt: Date | null;

  @Column("timestamp with time zone", {
    name: "delivery_verified_at",
    nullable: true,
  })
  deliveryVerifiedAt: Date | null;

  @Column("enum", {
    name: "vehicle_type",
    enum: ["bike", "car", "suv", "truck"],
    default: () => "'bike'",
  })
  vehicleType: "bike" | "car" | "suv" | "truck";

  @ManyToOne(() => Drivers, (drivers) => drivers.rideRequests)
  @JoinColumn([{ name: "driver_id", referencedColumnName: "id" }])
  driver: Drivers;

  @ManyToOne(() => Rides, (rides) => rides.rideRequests, {
    onDelete: "CASCADE",
  })
  @JoinColumn([{ name: "ride_id", referencedColumnName: "id" }])
  ride: Rides;
}
