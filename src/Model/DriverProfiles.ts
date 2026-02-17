import {
  Column,
  Entity,
  Index,
  JoinColumn,
  OneToMany,
  OneToOne,
} from "typeorm";
import { DriverPayoutRequests } from "./DriverPayoutRequests";
import { Profiles } from "./Profiles";
import { DriverVerificationLocks } from "./DriverVerificationLocks";
import { ShopForMeRequests } from "./ShopForMeRequests";

@Index("driver_profiles_pkey", ["id"], { unique: true })
@Index("idx_driver_profiles_profile", ["profileId"], {})
@Index("driver_profiles_profile_id_key", ["profileId"], { unique: true })
@Entity("driver_profiles", { schema: "public" })
export class DriverProfiles {
  @Column("uuid", {
    primary: true,
    name: "id",
    default: () => "gen_random_uuid()",
  })
  id: string;

  @Column("uuid", { name: "profile_id", nullable: true, unique: true })
  profileId: string | null;

  @Column("text", { name: "vehicle_type", nullable: true })
  vehicleType: string | null;

  @Column("text", { name: "vehicle_number", nullable: true })
  vehicleNumber: string | null;

  @Column("text", { name: "vehicle_model", nullable: true })
  vehicleModel: string | null;

  @Column("text", { name: "vehicle_color", nullable: true })
  vehicleColor: string | null;

  @Column("text", { name: "license_number", nullable: true })
  licenseNumber: string | null;

  @Column("date", { name: "license_expiry", nullable: true })
  licenseExpiry: string | null;

  @Column("boolean", {
    name: "verified",
    nullable: true,
    default: () => "false",
  })
  verified: boolean | null;

  @Column("numeric", {
    name: "rating",
    nullable: true,
    precision: 3,
    scale: 2,
    default: () => "0.0",
  })
  rating: string | null;

  @Column("integer", {
    name: "total_reviews",
    nullable: true,
    default: () => "0",
  })
  totalReviews: number | null;

  @Column("integer", { name: "total_jobs", nullable: true, default: () => "0" })
  totalJobs: number | null;

  @Column("integer", {
    name: "completed_jobs",
    nullable: true,
    default: () => "0",
  })
  completedJobs: number | null;

  @Column("integer", {
    name: "cancelled_jobs",
    nullable: true,
    default: () => "0",
  })
  cancelledJobs: number | null;

  @Column("boolean", {
    name: "is_online",
    nullable: true,
    default: () => "false",
  })
  isOnline: boolean | null;

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

  @Column("text", { name: "ghana_card_number", nullable: true })
  ghanaCardNumber: string | null;

  @Column("jsonb", { name: "current_location", nullable: true })
  currentLocation: object | null;

  @Column("numeric", {
    name: "total_earnings",
    nullable: true,
    default: () => "0",
  })
  totalEarnings: string | null;

  @Column("integer", {
    name: "total_deliveries",
    nullable: true,
    default: () => "0",
  })
  totalDeliveries: number | null;

  @Column("numeric", {
    name: "available_balance",
    nullable: true,
    default: () => "0",
  })
  availableBalance: string | null;

  @OneToMany(
    () => DriverPayoutRequests,
    (driverPayoutRequests) => driverPayoutRequests.driver
  )
  driverPayoutRequests: DriverPayoutRequests[];

  @OneToOne(() => Profiles, (profiles) => profiles.driverProfiles, {
    onDelete: "CASCADE",
  })
  @JoinColumn([{ name: "profile_id", referencedColumnName: "id" }])
  profile: Profiles;

  @OneToMany(
    () => DriverVerificationLocks,
    (driverVerificationLocks) => driverVerificationLocks.driver
  )
  driverVerificationLocks: DriverVerificationLocks[];

  @OneToMany(
    () => ShopForMeRequests,
    (shopForMeRequests) => shopForMeRequests.driver
  )
  shopForMeRequests: ShopForMeRequests[];
}
