import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
} from "typeorm";
import { RideDriverResponses } from "./RideDriverResponses";
import { RideRequests } from "./RideRequests";
import { RideSearchAttempts } from "./RideSearchAttempts";
import { Drivers } from "./Drivers";
import { Orders } from "./Orders";
import { Profiles } from "./Profiles";

@Index("rides_pkey", ["id"], { unique: true })
@Index("idx_rides_order_id", ["orderId"], {})
@Entity("rides", { schema: "public" })
export class Rides {
  @Column("uuid", {
    primary: true,
    name: "id",
    default: () => "gen_random_uuid()",
  })
  id: string;

  @Column("geography", { name: "pickup" })
  pickup: string;

  @Column("geography", { name: "dropoff" })
  dropoff: string;

  @Column("text", { name: "status" })
  status: string;

  @Column("timestamp with time zone", {
    name: "requested_at",
    nullable: true,
    default: () => "now()",
  })
  requestedAt: Date | null;

  @Column("timestamp with time zone", { name: "started_at", nullable: true })
  startedAt: Date | null;

  @Column("timestamp with time zone", { name: "completed_at", nullable: true })
  completedAt: Date | null;

  @Column("uuid", { name: "order_id" })
  orderId: string;

  @Column("enum", {
    name: "vehicle_type",
    enum: ["bike", "car", "suv", "truck"],
    default: () => "'bike'",
  })
  vehicleType: "bike" | "car" | "suv" | "truck";

  @OneToMany(
    () => RideDriverResponses,
    (rideDriverResponses) => rideDriverResponses.ride
  )
  rideDriverResponses: RideDriverResponses[];

  @OneToMany(() => RideRequests, (rideRequests) => rideRequests.ride)
  rideRequests: RideRequests[];

  @OneToMany(
    () => RideSearchAttempts,
    (rideSearchAttempts) => rideSearchAttempts.ride
  )
  rideSearchAttempts: RideSearchAttempts[];

  @ManyToOne(() => Drivers, (drivers) => drivers.rides)
  @JoinColumn([{ name: "assigned_driver_id", referencedColumnName: "id" }])
  assignedDriver: Drivers;

  @ManyToOne(() => Orders, (orders) => orders.rides, { onDelete: "SET NULL" })
  @JoinColumn([{ name: "order_id", referencedColumnName: "id" }])
  order: Orders;

  @ManyToOne(() => Profiles, (profiles) => profiles.rides, {
    onDelete: "CASCADE",
  })
  @JoinColumn([{ name: "rider_id", referencedColumnName: "id" }])
  rider: Profiles;
}
