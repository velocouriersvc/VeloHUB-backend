import { Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { ReferralCodes } from "./ReferralCodes";

@Index("referral_links_pkey", ["id"], { unique: true })
@Index("referral_links_referred_unique", ["referredId"], { unique: true })
@Entity("referral_links", { schema: "public" })
export class ReferralLinks {
  @Column("uuid", {
    primary: true,
    name: "id",
    default: () => "uuid_generate_v4()",
  })
  id: string;

  @Column("uuid", { name: "referrer_id" })
  referrerId: string;

  @Column("uuid", { name: "referred_id", unique: true })
  referredId: string;

  @Column("timestamp with time zone", {
    name: "created_at",
    default: () => "now()",
  })
  createdAt: Date;

  @Column("timestamp with time zone", { name: "expires_at" })
  expiresAt: Date;

  @Column("text", { name: "status", default: () => "'pending'" })
  status: string;

  @Column("timestamp with time zone", { name: "completed_at", nullable: true })
  completedAt: Date | null;

  @Column("uuid", { name: "completed_order_id", nullable: true })
  completedOrderId: string | null;

  @Column("integer", { name: "required_successful_events", default: () => "1" })
  requiredSuccessfulEvents: number;

  @Column("jsonb", { name: "metadata", nullable: true })
  metadata: object | null;

  @ManyToOne(
    () => ReferralCodes,
    (referralCodes) => referralCodes.referralLinks
  )
  @JoinColumn([{ name: "referral_code", referencedColumnName: "code" }])
  referralCode: ReferralCodes;
}
