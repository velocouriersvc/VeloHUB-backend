import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
} from "typeorm";
import { TripPayments } from "./TripPayments";
import { Profiles } from "./Profiles";

@Index("trip_quotes_pkey", ["id"], { unique: true })
@Entity("trip_quotes", { schema: "public" })
export class TripQuotes {
  @Column("uuid", {
    primary: true,
    name: "id",
    default: () => "gen_random_uuid()",
  })
  id: string;

  @Column("jsonb", { name: "pickup" })
  pickup: object;

  @Column("jsonb", { name: "dropoff" })
  dropoff: object;

  @Column("jsonb", { name: "quotes" })
  quotes: object;

  @Column("text", {
    name: "status",
    nullable: true,
    default: () => "'pending'",
  })
  status: string | null;

  @Column("timestamp with time zone", { name: "quote_valid_until" })
  quoteValidUntil: Date;

  @Column("timestamp with time zone", {
    name: "created_at",
    nullable: true,
    default: () => "now()",
  })
  createdAt: Date | null;

  @OneToMany(() => TripPayments, (tripPayments) => tripPayments.tripQuote)
  tripPayments: TripPayments[];

  @ManyToOne(() => Profiles, (profiles) => profiles.tripQuotes, {
    onDelete: "CASCADE",
  })
  @JoinColumn([{ name: "user_id", referencedColumnName: "id" }])
  user: Profiles;
}
