import { Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { DriverProfiles } from "./DriverProfiles";

@Index("idx_driver_payout_requests_driver_id", ["driverId"], {})
@Index("driver_payout_requests_pkey", ["id"], { unique: true })
@Index("idx_driver_payout_requests_status", ["status"], {})
@Entity("driver_payout_requests", { schema: "public" })
export class DriverPayoutRequests {
  @Column("uuid", {
    primary: true,
    name: "id",
    default: () => "gen_random_uuid()",
  })
  id: string;

  @Column("uuid", { name: "driver_id" })
  driverId: string;

  @Column("numeric", { name: "amount" })
  amount: string;

  @Column("text", { name: "status", default: () => "'pending'" })
  status: string;

  @Column("text", { name: "payout_method", nullable: true })
  payoutMethod: string | null;

  @Column("jsonb", { name: "account_details", nullable: true })
  accountDetails: object | null;

  @Column("text", { name: "notes", nullable: true })
  notes: string | null;

  @Column("text", { name: "rejection_reason", nullable: true })
  rejectionReason: string | null;

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

  @Column("timestamp with time zone", { name: "processed_at", nullable: true })
  processedAt: Date | null;

  @Column("timestamp with time zone", { name: "completed_at", nullable: true })
  completedAt: Date | null;

  @ManyToOne(
    () => DriverProfiles,
    (driverProfiles) => driverProfiles.driverPayoutRequests,
    { onDelete: "CASCADE" }
  )
  @JoinColumn([{ name: "driver_id", referencedColumnName: "id" }])
  driver: DriverProfiles;
}
