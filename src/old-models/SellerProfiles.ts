import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
} from "typeorm";
import { SellerPayoutRequests } from "./SellerPayoutRequests";
import { Profiles } from "./Profiles";

@Index("seller_profiles_pkey", ["id"], { unique: true })
@Index("seller_profiles_user_id_key", ["userId"], { unique: true })
@Entity("seller_profiles", { schema: "public" })
export class SellerProfiles {
  @Column("uuid", {
    primary: true,
    name: "id",
    default: () => "gen_random_uuid()",
  })
  id: string;

  @Column("uuid", { name: "user_id", nullable: true, unique: true })
  userId: string | null;

  @Column("text", { name: "business_name", nullable: true })
  businessName: string | null;

  @Column("text", { name: "business_email", nullable: true })
  businessEmail: string | null;

  @Column("text", { name: "phone_number", nullable: true })
  phoneNumber: string | null;

  @Column("boolean", {
    name: "is_verified",
    nullable: true,
    default: () => "false",
  })
  isVerified: boolean | null;

  @Column("jsonb", { name: "payout_settings", nullable: true })
  payoutSettings: object | null;

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

  @Column("text", { name: "business_type", nullable: true })
  businessType: string | null;

  @Column("text", { name: "business_address", nullable: true })
  businessAddress: string | null;

  @Column("jsonb", { name: "business_hours", nullable: true })
  businessHours: object | null;

  @Column("text", { name: "bank_name", nullable: true })
  bankName: string | null;

  @Column("text", { name: "bank_account_number", nullable: true })
  bankAccountNumber: string | null;

  @Column("text", { name: "tax_id", nullable: true })
  taxId: string | null;

  @Column("text", { name: "ghana_card_number", nullable: true })
  ghanaCardNumber: string | null;

  @Column("text", { name: "ghana_card_front_url", nullable: true })
  ghanaCardFrontUrl: string | null;

  @Column("text", { name: "ghana_card_back_url", nullable: true })
  ghanaCardBackUrl: string | null;

  @Column("text", { name: "business_cert_url", nullable: true })
  businessCertUrl: string | null;

  @Column("numeric", {
    name: "rating",
    nullable: true,
    precision: 3,
    scale: 2,
    default: () => "5.0",
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

  @Column("text", { name: "bank_branch", nullable: true })
  bankBranch: string | null;

  @Column("text", { name: "account_name", nullable: true })
  accountName: string | null;

  @OneToMany(
    () => SellerPayoutRequests,
    (sellerPayoutRequests) => sellerPayoutRequests.seller
  )
  sellerPayoutRequests: SellerPayoutRequests[];

  @ManyToOne(() => Profiles, (profiles) => profiles.sellerProfiles)
  @JoinColumn([{ name: "profile_id", referencedColumnName: "id" }])
  profile: Profiles;
}
