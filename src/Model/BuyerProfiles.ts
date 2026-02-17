import { Column, Entity, Index, JoinColumn, OneToOne } from "typeorm";
import { Profiles } from "./Profiles";

@Index("buyer_profiles_pkey", ["id"], { unique: true })
@Index("buyer_profiles_profile_id_key", ["profileId"], { unique: true })
@Index("idx_buyer_profiles_profile", ["profileId"], {})
@Entity("buyer_profiles", { schema: "public" })
export class BuyerProfiles {
  @Column("uuid", {
    primary: true,
    name: "id",
    default: () => "gen_random_uuid()",
  })
  id: string;

  @Column("uuid", { name: "profile_id", nullable: true, unique: true })
  profileId: string | null;

  @Column("jsonb", { name: "saved_addresses", nullable: true, default: [] })
  savedAddresses: object | null;

  @Column("jsonb", { name: "payment_methods", nullable: true, default: [] })
  paymentMethods: object | null;

  @Column("jsonb", { name: "preferences", nullable: true, default: {} })
  preferences: object | null;

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

  @OneToOne(() => Profiles, (profiles) => profiles.buyerProfiles, {
    onDelete: "CASCADE",
  })
  @JoinColumn([{ name: "profile_id", referencedColumnName: "id" }])
  profile: Profiles;
}
