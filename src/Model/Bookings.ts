import { Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { Profiles } from "./Profiles";

@Index("idx_bookings_created_at", ["createdAt"], {})
@Index("bookings_pkey", ["id"], { unique: true })
@Index("idx_bookings_status", ["status"], {})
@Index("idx_bookings_user_id", ["userId"], {})
@Entity("bookings", { schema: "public" })
export class Bookings {
  @Column("uuid", {
    primary: true,
    name: "id",
    default: () => "gen_random_uuid()",
  })
  id: string;

  @Column("uuid", { name: "user_id", nullable: true })
  userId: string | null;

  @Column("text", { name: "service_name" })
  serviceName: string;

  @Column("numeric", { name: "amount" })
  amount: string;

  @Column("text", { name: "status", default: () => "'pending'" })
  status: string;

  @Column("text", { name: "payment_status", default: () => "'pending'" })
  paymentStatus: string;

  @Column("text", { name: "payment_intent_id", nullable: true })
  paymentIntentId: string | null;

  @Column("jsonb", { name: "delivery_address", nullable: true })
  deliveryAddress: object | null;

  @Column("text", { name: "delivery_city", nullable: true })
  deliveryCity: string | null;

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

  @Column("timestamp with time zone", { name: "completed_at", nullable: true })
  completedAt: Date | null;

  @ManyToOne(() => Profiles, (profiles) => profiles.bookings)
  @JoinColumn([{ name: "user_id", referencedColumnName: "id" }])
  user: Profiles;
}
