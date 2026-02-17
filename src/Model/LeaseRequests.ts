import { Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { Profiles } from "./Profiles";
import { LeaseVehicles } from "./LeaseVehicles";

@Index("lease_requests_pkey", ["id"], { unique: true })
@Index("idx_lease_requests_status", ["status"], {})
@Index("idx_lease_requests_user", ["userId"], {})
@Index("idx_lease_requests_vehicle", ["vehicleId"], {})
@Entity("lease_requests", { schema: "public" })
export class LeaseRequests {
  @Column("uuid", {
    primary: true,
    name: "id",
    default: () => "gen_random_uuid()",
  })
  id: string;

  @Column("uuid", { name: "vehicle_id", nullable: true })
  vehicleId: string | null;

  @Column("uuid", { name: "user_id", nullable: true })
  userId: string | null;

  @Column("date", { name: "start_date" })
  startDate: string;

  @Column("date", { name: "end_date" })
  endDate: string;

  @Column("integer", { name: "lease_duration_days" })
  leaseDurationDays: number;

  @Column("numeric", { name: "total_amount" })
  totalAmount: string;

  @Column("numeric", {
    name: "deposit_paid",
    nullable: true,
    default: () => "0",
  })
  depositPaid: string | null;

  @Column("text", {
    name: "status",
    nullable: true,
    default: () => "'pending'",
  })
  status: string | null;

  @Column("text", { name: "pickup_location", nullable: true })
  pickupLocation: string | null;

  @Column("text", { name: "dropoff_location", nullable: true })
  dropoffLocation: string | null;

  @Column("text", { name: "driver_license_number" })
  driverLicenseNumber: string;

  @Column("date", { name: "driver_license_expiry" })
  driverLicenseExpiry: string;

  @Column("text", { name: "additional_notes", nullable: true })
  additionalNotes: string | null;

  @Column("text", { name: "payment_method", nullable: true })
  paymentMethod: string | null;

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

  @Column("timestamp with time zone", { name: "approved_at", nullable: true })
  approvedAt: Date | null;

  @Column("timestamp with time zone", { name: "completed_at", nullable: true })
  completedAt: Date | null;

  @Column("timestamp with time zone", { name: "cancelled_at", nullable: true })
  cancelledAt: Date | null;

  @Column("text", {
    name: "request_type",
    nullable: true,
    default: () => "'lease'",
  })
  requestType: string | null;

  @Column("numeric", { name: "purchase_price", nullable: true })
  purchasePrice: string | null;

  @Column("integer", { name: "payment_plan_months", nullable: true })
  paymentPlanMonths: number | null;

  @Column("numeric", { name: "monthly_payment_amount", nullable: true })
  monthlyPaymentAmount: string | null;

  @Column("numeric", {
    name: "down_payment",
    nullable: true,
    default: () => "0",
  })
  downPayment: string | null;

  @ManyToOne(() => Profiles, (profiles) => profiles.leaseRequests)
  @JoinColumn([{ name: "user_id", referencedColumnName: "id" }])
  user: Profiles;

  @ManyToOne(
    () => LeaseVehicles,
    (leaseVehicles) => leaseVehicles.leaseRequests
  )
  @JoinColumn([{ name: "vehicle_id", referencedColumnName: "id" }])
  vehicle: LeaseVehicles;
}
