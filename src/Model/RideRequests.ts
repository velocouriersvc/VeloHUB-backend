import { Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { Orders } from "./Orders";
import { Profiles } from "./Profiles";

@Index("idx_ride_requests_created_at", ["createdAt"], {})
@Index("idx_ride_requests_driver_id", ["driverId"], {})
@Index("ride_requests_pkey", ["id"], { unique: true })
@Index("idx_ride_requests_order_id_fkey", ["orderId"], {})
@Index("idx_ride_requests_scheduled_for", ["scheduledFor"], {})
@Index("idx_ride_requests_status", ["status"], {})
@Index("idx_ride_requests_user_id", ["userId"], {})
@Entity("ride_requests", { schema: "public" })
export class RideRequests {
  @Column("uuid", {
    primary: true,
    name: "id",
    default: () => "gen_random_uuid()",
  })
  id: string;

  @Column("uuid", { name: "user_id", nullable: true })
  userId: string | null;

  @Column("uuid", { name: "order_id", nullable: true })
  orderId: string | null;

  @Column("jsonb", { name: "pickup_location" })
  pickupLocation: object;

  @Column("jsonb", { name: "dropoff_location" })
  dropoffLocation: object;

  @Column("numeric", { name: "estimated_distance", nullable: true })
  estimatedDistance: string | null;

  @Column("integer", { name: "estimated_duration", nullable: true })
  estimatedDuration: number | null;

  @Column("text", { name: "vehicle_type" })
  vehicleType: string;

  @Column("numeric", { name: "base_fare" })
  baseFare: string;

  @Column("numeric", { name: "distance_fare" })
  distanceFare: string;

  @Column("numeric", {
    name: "surge_multiplier",
    nullable: true,
    default: () => "1.0",
  })
  surgeMultiplier: string | null;

  @Column("numeric", { name: "estimated_fare" })
  estimatedFare: string;

  @Column("numeric", { name: "final_fare", nullable: true })
  finalFare: string | null;

  @Column("jsonb", { name: "fare_breakdown", nullable: true, default: {} })
  fareBreakdown: object | null;

  @Column("uuid", { name: "driver_id", nullable: true })
  driverId: string | null;

  @Column("timestamp with time zone", {
    name: "driver_accepted_at",
    nullable: true,
  })
  driverAcceptedAt: Date | null;

  @Column("text", { name: "status", default: () => "'pending'" })
  status: string;

  @Column("boolean", {
    name: "is_scheduled",
    nullable: true,
    default: () => "false",
  })
  isScheduled: boolean | null;

  @Column("timestamp with time zone", { name: "scheduled_for", nullable: true })
  scheduledFor: Date | null;

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

  @Column("timestamp with time zone", { name: "started_at", nullable: true })
  startedAt: Date | null;

  @Column("timestamp with time zone", { name: "completed_at", nullable: true })
  completedAt: Date | null;

  @Column("timestamp with time zone", { name: "cancelled_at", nullable: true })
  cancelledAt: Date | null;

  @Column("text", { name: "cancellation_reason", nullable: true })
  cancellationReason: string | null;

  @Column("text", { name: "payment_method", nullable: true })
  paymentMethod: string | null;

  @Column("text", {
    name: "payment_status",
    nullable: true,
    default: () => "'pending'",
  })
  paymentStatus: string | null;

  @Column("integer", { name: "rating", nullable: true })
  rating: number | null;

  @Column("text", { name: "review_comment", nullable: true })
  reviewComment: string | null;

  @ManyToOne(() => Orders, (orders) => orders.rideRequests)
  @JoinColumn([{ name: "order_id", referencedColumnName: "id" }])
  order: Orders;

  @ManyToOne(() => Profiles, (profiles) => profiles.rideRequests)
  @JoinColumn([{ name: "user_id", referencedColumnName: "id" }])
  user: Profiles;
}
