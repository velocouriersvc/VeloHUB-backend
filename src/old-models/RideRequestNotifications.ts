import { Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { Drivers } from "./Drivers";
import { RideBookings } from "./RideBookings";

@Index(
  "ride_request_notifications_driver_id_ride_request_id_key",
  ["driverId", "rideRequestId"],
  { unique: true }
)
@Index("idx_ride_notifications_driver", ["driverId", "status"], {})
@Index("ride_request_notifications_pkey", ["id"], { unique: true })
@Index("idx_ride_notifications_request", ["rideRequestId", "status"], {})
@Entity("ride_request_notifications", { schema: "public" })
export class RideRequestNotifications {
  @Column("uuid", {
    primary: true,
    name: "id",
    default: () => "gen_random_uuid()",
  })
  id: string;

  @Column("uuid", { name: "driver_id", nullable: true, unique: true })
  driverId: string | null;

  @Column("uuid", { name: "ride_request_id", nullable: true, unique: true })
  rideRequestId: string | null;

  @Column("text", {
    name: "status",
    nullable: true,
    default: () => "'pending'",
  })
  status: string | null;

  @Column("timestamp with time zone", {
    name: "created_at",
    nullable: true,
    default: () => "now()",
  })
  createdAt: Date | null;

  @Column("timestamp with time zone", { name: "expires_at" })
  expiresAt: Date;

  @Column("timestamp with time zone", { name: "responded_at", nullable: true })
  respondedAt: Date | null;

  @ManyToOne(() => Drivers, (drivers) => drivers.rideRequestNotifications, {
    onDelete: "CASCADE",
  })
  @JoinColumn([{ name: "driver_id", referencedColumnName: "id" }])
  driver: Drivers;

  @ManyToOne(
    () => RideBookings,
    (rideBookings) => rideBookings.rideRequestNotifications,
    { onDelete: "CASCADE" }
  )
  @JoinColumn([{ name: "ride_request_id", referencedColumnName: "id" }])
  rideRequest: RideBookings;
}
