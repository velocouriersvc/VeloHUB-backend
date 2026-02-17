import {
  Column,
  Entity,
  Index,
  JoinColumn,
  OneToMany,
  OneToOne,
} from "typeorm";
import { SellerPayoutRequests } from "./SellerPayoutRequests";
import { Profiles } from "./Profiles";

@Index("seller_profiles_pkey", ["id"], { unique: true })
@Index("seller_profiles_profile_id_key", ["profileId"], { unique: true })
@Index("idx_seller_profiles_profile", ["profileId"], {})
@Entity("seller_profiles", { schema: "public" })
export class SellerProfiles {
  @Column("uuid", {
    primary: true,
    name: "id",
    default: () => "gen_random_uuid()",
  })
  id: string;

  @Column("uuid", { name: "profile_id", nullable: true, unique: true })
  profileId: string | null;

  @Column("text", { name: "business_name", nullable: true })
  businessName: string | null;

  @Column("text", { name: "business_type", nullable: true })
  businessType: string | null;

  @Column("text", { name: "business_address", nullable: true })
  businessAddress: string | null;

  @Column("jsonb", { name: "business_hours", nullable: true, default: {} })
  businessHours: object | null;

  @Column("text", { name: "bank_account_number", nullable: true })
  bankAccountNumber: string | null;

  @Column("text", { name: "bank_name", nullable: true })
  bankName: string | null;

  @Column("text", { name: "tax_id", nullable: true })
  taxId: string | null;

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

  @Column("integer", {
    name: "total_sales",
    nullable: true,
    default: () => "0",
  })
  totalSales: number | null;

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

  @Column("numeric", {
    name: "total_earnings",
    nullable: true,
    default: () => "0",
  })
  totalEarnings: string | null;

  @Column("numeric", {
    name: "pending_earnings",
    nullable: true,
    default: () => "0",
  })
  pendingEarnings: string | null;

  @Column("numeric", {
    name: "total_commission",
    nullable: true,
    default: () => "0",
  })
  totalCommission: string | null;

  @OneToMany(
    () => SellerPayoutRequests,
    (sellerPayoutRequests) => sellerPayoutRequests.seller
  )
  sellerPayoutRequests: SellerPayoutRequests[];

  @OneToOne(() => Profiles, (profiles) => profiles.sellerProfiles, {
    onDelete: "CASCADE",
  })
  @JoinColumn([{ name: "profile_id", referencedColumnName: "id" }])
  profile: Profiles;
}
