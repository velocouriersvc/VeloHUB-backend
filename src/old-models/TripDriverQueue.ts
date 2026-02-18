import { Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { Drivers } from "./Drivers";
import { Trips } from "./Trips";

@Index("trip_driver_queue_trip_id_driver_id_key", ["driverId", "tripId"], {
  unique: true,
})
@Index("trip_driver_queue_pkey", ["id"], { unique: true })
@Index("trip_driver_queue_trip_id_position_idx", ["position", "tripId"], {})
@Index("trip_driver_queue_status_idx", ["status"], {})
@Index("trip_driver_queue_trip_id_idx", ["tripId"], {})
@Entity("trip_driver_queue", { schema: "public" })
export class TripDriverQueue {
  @Column("uuid", {
    primary: true,
    name: "id",
    default: () => "gen_random_uuid()",
  })
  id: string;

  @Column("uuid", { name: "trip_id", unique: true })
  tripId: string;

  @Column("uuid", { name: "driver_id", unique: true })
  driverId: string;

  @Column("integer", { name: "position" })
  position: number;

  @Column("numeric", { name: "distance_m" })
  distanceM: string;

  @Column("text", { name: "status", default: () => "'pending'" })
  status: string;

  @Column("timestamp with time zone", { name: "notified_at", nullable: true })
  notifiedAt: Date | null;

  @Column("timestamp with time zone", { name: "responded_at", nullable: true })
  respondedAt: Date | null;

  @Column("timestamp with time zone", {
    name: "created_at",
    nullable: true,
    default: () => "now()",
  })
  createdAt: Date | null;

  @ManyToOne(() => Drivers, (drivers) => drivers.tripDriverQueues, {
    onDelete: "CASCADE",
  })
  @JoinColumn([{ name: "driver_id", referencedColumnName: "id" }])
  driver: Drivers;

  @ManyToOne(() => Trips, (trips) => trips.tripDriverQueues, {
    onDelete: "CASCADE",
  })
  @JoinColumn([{ name: "trip_id", referencedColumnName: "id" }])
  trip: Trips;
}
