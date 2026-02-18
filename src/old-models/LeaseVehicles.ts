import { Column, Entity, Index, OneToMany } from "typeorm";
import { LeaseRequests } from "./LeaseRequests";

@Index("lease_vehicles_pkey", ["id"], { unique: true })
@Entity("lease_vehicles", { schema: "public" })
export class LeaseVehicles {
  @Column("uuid", {
    primary: true,
    name: "id",
    default: () => "gen_random_uuid()",
  })
  id: string;

  @Column("uuid", { name: "owner_id", nullable: true })
  ownerId: string | null;

  @Column("text", { name: "make" })
  make: string;

  @Column("text", { name: "model" })
  model: string;

  @Column("integer", { name: "year", nullable: true })
  year: number | null;

  @Column("text", { name: "transmission", nullable: true })
  transmission: string | null;

  @Column("text", { name: "fuel_type", nullable: true })
  fuelType: string | null;

  @Column("text", { name: "vehicle_type" })
  vehicleType: string;

  @Column("numeric", { name: "daily_rate", precision: 10, scale: 2 })
  dailyRate: string;

  @Column("numeric", {
    name: "weekly_rate",
    nullable: true,
    precision: 10,
    scale: 2,
  })
  weeklyRate: string | null;

  @Column("numeric", {
    name: "monthly_rate",
    nullable: true,
    precision: 10,
    scale: 2,
  })
  monthlyRate: string | null;

  @Column("text", { name: "image_url", nullable: true })
  imageUrl: string | null;

  @Column("text", { name: "description", nullable: true })
  description: string | null;

  @Column("boolean", {
    name: "available",
    nullable: true,
    default: () => "true",
  })
  available: boolean | null;

  @Column("text", { name: "location", nullable: true })
  location: string | null;

  @Column("integer", { name: "seats", nullable: true })
  seats: number | null;

  @Column("numeric", {
    name: "rating",
    nullable: true,
    precision: 3,
    scale: 2,
    default: () => "5.0",
  })
  rating: string | null;

  @Column("text", { name: "owner_name", nullable: true })
  ownerName: string | null;

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

  @OneToMany(() => LeaseRequests, (leaseRequests) => leaseRequests.vehicle)
  leaseRequests: LeaseRequests[];
}
