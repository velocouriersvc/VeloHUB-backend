import { Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { Trips } from "./Trips";

@Index("trip_pricing_quotes_pkey", ["id"], { unique: true })
@Entity("trip_pricing_quotes", { schema: "public" })
export class TripPricingQuotes {
  @Column("uuid", {
    primary: true,
    name: "id",
    default: () => "gen_random_uuid()",
  })
  id: string;

  @Column("text", { name: "tier" })
  tier: string;

  @Column("numeric", { name: "estimated_fare" })
  estimatedFare: string;

  @Column("text", { name: "currency", default: () => "'GHS'" })
  currency: string;

  @Column("timestamp with time zone", {
    name: "created_at",
    nullable: true,
    default: () => "now()",
  })
  createdAt: Date | null;

  @ManyToOne(() => Trips, (trips) => trips.tripPricingQuotes, {
    onDelete: "CASCADE",
  })
  @JoinColumn([{ name: "trip_id", referencedColumnName: "id" }])
  trip: Trips;
}
