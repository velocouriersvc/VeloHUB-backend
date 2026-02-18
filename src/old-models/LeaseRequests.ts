import { Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { LeaseVehicles } from "./LeaseVehicles";

@Index("lease_requests_pkey", ["id"], { unique: true })
@Entity("lease_requests", { schema: "public" })
export class LeaseRequests {
  @Column("uuid", {
    primary: true,
    name: "id",
    default: () => "gen_random_uuid()",
  })
  id: string;

  @Column("uuid", { name: "user_id", nullable: true })
  userId: string | null;

  @Column("date", { name: "start_date" })
  startDate: string;

  @Column("date", { name: "end_date" })
  endDate: string;

  @Column("integer", { name: "lease_duration_days", nullable: true })
  leaseDurationDays: number | null;

  @Column("numeric", { name: "total_amount", precision: 10, scale: 2 })
  totalAmount: string;

  @Column("numeric", {
    name: "deposit_paid",
    nullable: true,
    precision: 10,
    scale: 2,
    default: () => "0",
  })
  depositPaid: string | null;

  @Column("text", { name: "pickup_location", nullable: true })
  pickupLocation: string | null;

  @Column("text", { name: "dropoff_location", nullable: true })
  dropoffLocation: string | null;

  @Column("text", { name: "driver_license_number", nullable: true })
  driverLicenseNumber: string | null;

  @Column("date", { name: "driver_license_expiry", nullable: true })
  driverLicenseExpiry: string | null;

  @Column("text", { name: "additional_notes", nullable: true })
  additionalNotes: string | null;

  @Column("text", {
    name: "status",
    nullable: true,
    default: () => "'pending'",
  })
  status: string | null;

  @Column("text", {
    name: "payment_status",
    nullable: true,
    default: () => "'pending'",
  })
  paymentStatus: string | null;

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

  @ManyToOne(
    () => LeaseVehicles,
    (leaseVehicles) => leaseVehicles.leaseRequests,
    { onDelete: "CASCADE" }
  )
  @JoinColumn([{ name: "vehicle_id", referencedColumnName: "id" }])
  vehicle: LeaseVehicles;
}
