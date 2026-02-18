import { Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { Drivers } from "./Drivers";
import { Rides } from "./Rides";

@Index("ride_driver_responses_pkey", ["id"], { unique: true })
@Entity("ride_driver_responses", { schema: "public" })
export class RideDriverResponses {
  @Column("uuid", {
    primary: true,
    name: "id",
    default: () => "gen_random_uuid()",
  })
  id: string;

  @Column("text", { name: "response" })
  response: string;

  @Column("timestamp with time zone", {
    name: "responded_at",
    nullable: true,
    default: () => "now()",
  })
  respondedAt: Date | null;

  @ManyToOne(() => Drivers, (drivers) => drivers.rideDriverResponses, {
    onDelete: "CASCADE",
  })
  @JoinColumn([{ name: "driver_id", referencedColumnName: "id" }])
  driver: Drivers;

  @ManyToOne(() => Rides, (rides) => rides.rideDriverResponses, {
    onDelete: "CASCADE",
  })
  @JoinColumn([{ name: "ride_id", referencedColumnName: "id" }])
  ride: Rides;
}
