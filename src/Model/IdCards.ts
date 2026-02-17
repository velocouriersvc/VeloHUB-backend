import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
} from "typeorm";
import { Profiles } from "./Profiles";

@Index("id_cards_pkey", ["id"], { unique: true })
@Index("idx_profiles_id_cards", ["profileId"], {})
@Entity("id_cards", { schema: "public" })
export class IdCards {
  @Column("uuid", {
    primary: true,
    name: "id",
    default: () => "gen_random_uuid()",
  })
  id: string;

  @Column("uuid", { name: "profile_id" })
  profileId: string;

  @Column("text", { name: "front_url", nullable: true })
  frontUrl: string | null;

  @Column("text", { name: "back_url", nullable: true })
  backUrl: string | null;

  @Column("character varying", {
    name: "card_type",
    nullable: true,
    length: 100,
  })
  cardType: string | null;

  @Column("character varying", {
    name: "card_number",
    nullable: true,
    length: 255,
  })
  cardNumber: string | null;

  @Column("character varying", {
    name: "card_issuing_country",
    nullable: true,
    length: 3,
  })
  cardIssuingCountry: string | null;

  @Column("timestamp with time zone", {
    name: "card_issuing_date",
    nullable: true,
  })
  cardIssuingDate: Date | null;

  @Column("timestamp with time zone", {
    name: "card_expiration_date",
    nullable: true,
  })
  cardExpirationDate: Date | null;

  @Column("character varying", {
    name: "status",
    nullable: true,
    length: 20,
    default: () => "'pending'",
  })
  status: string | null;

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

  @ManyToOne(() => Profiles, (profiles) => profiles.idCards, {
    onDelete: "CASCADE",
  })
  @JoinColumn([{ name: "profile_id", referencedColumnName: "id" }])
  profile: Profiles;

  @OneToMany(() => Profiles, (profiles) => profiles.idCard)
  profiles: Profiles[];
}
