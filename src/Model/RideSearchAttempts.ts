import { Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { Rides } from "./Rides";

@Index("ride_search_attempts_pkey", ["id"], { unique: true })
@Entity("ride_search_attempts", { schema: "public" })
export class RideSearchAttempts {
  @Column("uuid", {
    primary: true,
    name: "id",
    default: () => "gen_random_uuid()",
  })
  id: string;

  @Column("integer", { name: "attempt_number" })
  attemptNumber: number;

  @Column("integer", { name: "radius_m" })
  radiusM: number;

  @Column("timestamp with time zone", {
    name: "started_at",
    nullable: true,
    default: () => "now()",
  })
  startedAt: Date | null;

  @Column("text", { name: "outcome", nullable: true })
  outcome: string | null;

  @ManyToOne(() => Rides, (rides) => rides.rideSearchAttempts, {
    onDelete: "CASCADE",
  })
  @JoinColumn([{ name: "ride_id", referencedColumnName: "id" }])
  ride: Rides;
}
