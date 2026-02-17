import { Column, Entity, Index, OneToMany } from "typeorm";
import { ReferralLinks } from "./ReferralLinks";

@Index("referral_codes_code_key", ["code"], { unique: true })
@Index("referral_codes_pkey", ["id"], { unique: true })
@Index("referral_codes_user_id_key", ["userId"], { unique: true })
@Entity("referral_codes", { schema: "public" })
export class ReferralCodes {
  @Column("uuid", {
    primary: true,
    name: "id",
    default: () => "gen_random_uuid()",
  })
  id: string;

  @Column("uuid", { name: "user_id", unique: true })
  userId: string;

  @Column("text", { name: "code", unique: true })
  code: string;

  @Column("timestamp with time zone", {
    name: "created_at",
    default: () => "now()",
  })
  createdAt: Date;

  @OneToMany(() => ReferralLinks, (referralLinks) => referralLinks.referralCode)
  referralLinks: ReferralLinks[];
}
