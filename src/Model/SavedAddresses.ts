import { Column, Entity, Index, JoinColumn, OneToOne } from "typeorm";
import { Profiles } from "./Profiles";

@Index("saved_addresses_pkey", ["id"], { unique: true })
@Index("idx_user_default_address", ["userId"], { unique: true })
@Index("idx_saved_addresses_user", ["userId"], {})
@Entity("saved_addresses", { schema: "public" })
export class SavedAddresses {
  @Column("uuid", {
    primary: true,
    name: "id",
    default: () => "gen_random_uuid()",
  })
  id: string;

  @Column("uuid", { name: "user_id" })
  userId: string;

  @Column("character varying", { name: "label", nullable: true, length: 50 })
  label: string | null;

  @Column("text", { name: "address_line" })
  addressLine: string;

  @Column("character varying", { name: "city", nullable: true, length: 100 })
  city: string | null;

  @Column("character varying", { name: "state", nullable: true, length: 100 })
  state: string | null;

  @Column("character varying", {
    name: "postal_code",
    nullable: true,
    length: 20,
  })
  postalCode: string | null;

  @Column("character varying", { name: "country", nullable: true, length: 3 })
  country: string | null;

  @Column("numeric", { name: "lat", precision: 10, scale: 8 })
  lat: string;

  @Column("numeric", { name: "lng", precision: 11, scale: 8 })
  lng: string;

  @Column("boolean", {
    name: "is_default",
    nullable: true,
    default: () => "false",
  })
  isDefault: boolean | null;

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

  @OneToOne(() => Profiles, (profiles) => profiles.savedAddresses, {
    onDelete: "CASCADE",
  })
  @JoinColumn([{ name: "user_id", referencedColumnName: "id" }])
  user: Profiles;
}
