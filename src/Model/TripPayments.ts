import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
} from "typeorm";
import { TripQuotes } from "./TripQuotes";
import { Profiles } from "./Profiles";
import { Trips } from "./Trips";

@Index("trip_payments_pkey", ["id"], { unique: true })
@Entity("trip_payments", { schema: "public" })
export class TripPayments {
  @Column("uuid", {
    primary: true,
    name: "id",
    default: () => "gen_random_uuid()",
  })
  id: string;

  @Column("text", { name: "ride_type" })
  rideType: string;

  @Column("numeric", { name: "amount" })
  amount: string;

  @Column("text", {
    name: "status",
    nullable: true,
    default: () => "'pending'",
  })
  status: string | null;

  @Column("text", { name: "paystack_reference", nullable: true })
  paystackReference: string | null;

  @Column("timestamp with time zone", {
    name: "created_at",
    nullable: true,
    default: () => "now()",
  })
  createdAt: Date | null;

  @Column("numeric", { name: "user_service_fee", nullable: true })
  userServiceFee: string | null;

  @Column("numeric", { name: "platform_service_fee", nullable: true })
  platformServiceFee: string | null;

  @Column("numeric", { name: "commission", nullable: true })
  commission: string | null;

  @Column("numeric", { name: "driver_amount", nullable: true })
  driverAmount: string | null;

  @Column("numeric", { name: "platform_amount", nullable: true })
  platformAmount: string | null;

  @ManyToOne(() => TripQuotes, (tripQuotes) => tripQuotes.tripPayments, {
    onDelete: "CASCADE",
  })
  @JoinColumn([{ name: "trip_quote_id", referencedColumnName: "id" }])
  tripQuote: TripQuotes;

  @ManyToOne(() => Profiles, (profiles) => profiles.tripPayments, {
    onDelete: "CASCADE",
  })
  @JoinColumn([{ name: "user_id", referencedColumnName: "id" }])
  user: Profiles;

  @OneToMany(() => Trips, (trips) => trips.tripPayment)
  trips: Trips[];
}
