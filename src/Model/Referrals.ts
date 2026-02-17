import { Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { Profiles } from "./Profiles";

@Index("idx_referrals_created_at", ["createdAt"], {})
@Index("referrals_pkey", ["id"], { unique: true })
@Index("idx_referrals_referral_code", ["referralCode"], {})
@Index("idx_referrals_referred_id", ["referredId"], {})
@Index("referrals_referrer_id_referred_id_key", ["referredId", "referrerId"], {
  unique: true,
})
@Index("idx_referrals_referred_id_fkey", ["referredId"], {})
@Index("idx_referrals_referrer_id", ["referrerId"], {})
@Index("idx_referrals_status", ["status"], {})
@Entity("referrals", { schema: "public" })
export class Referrals {
  @Column("uuid", {
    primary: true,
    name: "id",
    default: () => "gen_random_uuid()",
  })
  id: string;

  @Column("uuid", { name: "referrer_id", unique: true })
  referrerId: string;

  @Column("uuid", { name: "referred_id", unique: true })
  referredId: string;

  @Column("text", { name: "referral_code" })
  referralCode: string;

  @Column("text", { name: "status", default: () => "'pending'" })
  status: string;

  @Column("numeric", {
    name: "credit_amount",
    nullable: true,
    default: () => "0",
  })
  creditAmount: string | null;

  @Column("timestamp with time zone", {
    name: "created_at",
    nullable: true,
    default: () => "now()",
  })
  createdAt: Date | null;

  @Column("timestamp with time zone", { name: "completed_at", nullable: true })
  completedAt: Date | null;

  @Column("timestamp with time zone", { name: "credited_at", nullable: true })
  creditedAt: Date | null;

  @ManyToOne(() => Profiles, (profiles) => profiles.referrals, {
    onDelete: "CASCADE",
  })
  @JoinColumn([{ name: "referred_id", referencedColumnName: "id" }])
  referred: Profiles;

  @ManyToOne(() => Profiles, (profiles) => profiles.referrals2, {
    onDelete: "CASCADE",
  })
  @JoinColumn([{ name: "referrer_id", referencedColumnName: "id" }])
  referrer: Profiles;
}
