import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
} from "typeorm";
import { TripDriverQueue } from "./TripDriverQueue";
import { TripPricingQuotes } from "./TripPricingQuotes";
import { Drivers } from "./Drivers";
import { Profiles } from "./Profiles";
import { TripPayments } from "./TripPayments";

@Index("idx_trips_driver_id", ["driverId"], {})
@Index("trips_pkey", ["id"], { unique: true })
@Index("idx_trips_rider_id", ["riderId"], {})
@Index("idx_trips_status", ["status"], {})
@Entity("trips", { schema: "public" })
export class Trips {
  @Column("uuid", {
    primary: true,
    name: "id",
    default: () => "gen_random_uuid()",
  })
  id: string;

  @Column("uuid", { name: "rider_id" })
  riderId: string;

  @Column("uuid", { name: "driver_id", nullable: true })
  driverId: string | null;

  @Column("geography", { name: "pickup" })
  pickup: string;

  @Column("geography", { name: "dropoff" })
  dropoff: string;

  @Column("numeric", { name: "distance_km", nullable: true })
  distanceKm: string | null;

  @Column("numeric", { name: "estimated_duration_min", nullable: true })
  estimatedDurationMin: string | null;

  @Column("text", { name: "selected_tier", nullable: true })
  selectedTier: string | null;

  @Column("text", { name: "status", default: () => "'requested'" })
  status: string;

  @Column("timestamp with time zone", {
    name: "created_at",
    nullable: true,
    default: () => "now()",
  })
  createdAt: Date | null;

  @Column("timestamp with time zone", { name: "arrived_at", nullable: true })
  arrivedAt: Date | null;

  @Column("timestamp with time zone", { name: "started_at", nullable: true })
  startedAt: Date | null;

  @Column("timestamp with time zone", { name: "completed_at", nullable: true })
  completedAt: Date | null;

  @Column("numeric", { name: "pickup_lat" })
  pickupLat: string;

  @Column("numeric", { name: "pickup_lng" })
  pickupLng: string;

  @Column("numeric", { name: "dropoff_lat" })
  dropoffLat: string;

  @Column("numeric", { name: "dropoff_lng" })
  dropoffLng: string;

  @Column("text", {
    name: "dispatch_status",
    nullable: true,
    default: () => "'searching'",
  })
  dispatchStatus: string | null;

  @Column("uuid", { name: "current_offer_driver_id", nullable: true })
  currentOfferDriverId: string | null;

  @OneToMany(() => TripDriverQueue, (tripDriverQueue) => tripDriverQueue.trip)
  tripDriverQueues: TripDriverQueue[];

  @OneToMany(
    () => TripPricingQuotes,
    (tripPricingQuotes) => tripPricingQuotes.trip
  )
  tripPricingQuotes: TripPricingQuotes[];

  @ManyToOne(() => Drivers, (drivers) => drivers.trips)
  @JoinColumn([{ name: "driver_id", referencedColumnName: "id" }])
  driver: Drivers;

  @ManyToOne(() => Profiles, (profiles) => profiles.trips, {
    onDelete: "CASCADE",
  })
  @JoinColumn([{ name: "rider_id", referencedColumnName: "id" }])
  rider: Profiles;

  @ManyToOne(() => TripPayments, (tripPayments) => tripPayments.trips)
  @JoinColumn([{ name: "trip_payment_id", referencedColumnName: "id" }])
  tripPayment: TripPayments;
}
