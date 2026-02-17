import { Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { RideBookings } from "./RideBookings";

@Index("emergency_notifications_pkey", ["id"], { unique: true })
@Index("idx_emergency_notifications_ride", ["rideId"], {})
@Entity("emergency_notifications", { schema: "public" })
export class EmergencyNotifications {
  @Column("uuid", {
    primary: true,
    name: "id",
    default: () => "gen_random_uuid()",
  })
  id: string;

  @Column("uuid", { name: "ride_id", nullable: true })
  rideId: string | null;

  @Column("text", { name: "contact_name" })
  contactName: string;

  @Column("text", { name: "contact_phone" })
  contactPhone: string;

  @Column("text", { name: "message" })
  message: string;

  @Column("text", {
    name: "status",
    nullable: true,
    default: () => "'pending'",
  })
  status: string | null;

  @Column("timestamp with time zone", {
    name: "sent_at",
    nullable: true,
    default: () => "now()",
  })
  sentAt: Date | null;

  @Column("timestamp with time zone", {
    name: "created_at",
    nullable: true,
    default: () => "now()",
  })
  createdAt: Date | null;

  @ManyToOne(
    () => RideBookings,
    (rideBookings) => rideBookings.emergencyNotifications,
    { onDelete: "CASCADE" }
  )
  @JoinColumn([{ name: "ride_id", referencedColumnName: "id" }])
  ride: RideBookings;
}
