import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
} from "typeorm";
import { LeaseRequests } from "./LeaseRequests";
import { Profiles } from "./Profiles";

@Index("idx_lease_vehicles_available", ["available"], {})
@Index("lease_vehicles_pkey", ["id"], { unique: true })
@Index("idx_lease_vehicles_owner_id", ["ownerId"], {})
@Index("idx_lease_vehicles_type", ["vehicleType"], {})
@Entity("lease_vehicles", { schema: "public" })
export class LeaseVehicles {
  @Column("uuid", {
    primary: true,
    name: "id",
    default: () => "gen_random_uuid()",
  })
  id: string;

  @Column("text", { name: "vehicle_type" })
  vehicleType: string;

  @Column("text", { name: "make" })
  make: string;

  @Column("text", { name: "model" })
  model: string;

  @Column("integer", { name: "year" })
  year: number;

  @Column("text", { name: "color", nullable: true })
  color: string | null;

  @Column("text", { name: "description", nullable: true })
  description: string | null;

  @Column("text", { name: "image_url", nullable: true })
  imageUrl: string | null;

  @Column("numeric", { name: "daily_rate" })
  dailyRate: string;

  @Column("numeric", { name: "weekly_rate", nullable: true })
  weeklyRate: string | null;

  @Column("numeric", { name: "monthly_rate", nullable: true })
  monthlyRate: string | null;

  @Column("numeric", { name: "deposit_amount" })
  depositAmount: string;

  @Column("boolean", {
    name: "available",
    nullable: true,
    default: () => "true",
  })
  available: boolean | null;

  @Column("jsonb", { name: "features", nullable: true, default: [] })
  features: object | null;

  @Column("jsonb", { name: "specifications", nullable: true, default: {} })
  specifications: object | null;

  @Column("text", { name: "location", nullable: true })
  location: string | null;

  @Column("integer", { name: "mileage_limit_per_day", nullable: true })
  mileageLimitPerDay: number | null;

  @Column("text", { name: "fuel_type", nullable: true })
  fuelType: string | null;

  @Column("text", { name: "transmission", nullable: true })
  transmission: string | null;

  @Column("integer", { name: "seats", nullable: true })
  seats: number | null;

  @Column("numeric", { name: "rating", nullable: true, default: () => "0.0" })
  rating: string | null;

  @Column("integer", {
    name: "total_reviews",
    nullable: true,
    default: () => "0",
  })
  totalReviews: number | null;

  @Column("integer", {
    name: "total_leases",
    nullable: true,
    default: () => "0",
  })
  totalLeases: number | null;

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

  @Column("numeric", { name: "purchase_price", nullable: true })
  purchasePrice: string | null;

  @Column("boolean", {
    name: "supports_purchase",
    nullable: true,
    default: () => "false",
  })
  supportsPurchase: boolean | null;

  @Column("boolean", {
    name: "supports_lease",
    nullable: true,
    default: () => "true",
  })
  supportsLease: boolean | null;

  @Column("jsonb", { name: "payment_terms", nullable: true, default: [] })
  paymentTerms: object | null;

  @Column("uuid", { name: "owner_id", nullable: true })
  ownerId: string | null;

  @Column("text", { name: "owner_name", nullable: true })
  ownerName: string | null;

  @Column("text", { name: "owner_type", nullable: true })
  ownerType: string | null;

  @OneToMany(() => LeaseRequests, (leaseRequests) => leaseRequests.vehicle)
  leaseRequests: LeaseRequests[];

  @ManyToOne(() => Profiles, (profiles) => profiles.leaseVehicles)
  @JoinColumn([{ name: "owner_id", referencedColumnName: "id" }])
  owner: Profiles;
}
