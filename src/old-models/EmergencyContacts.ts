import { Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { BuyerInformation } from "./BuyerInformation";

@Index(
  "emergency_contacts_buyer_id_contact_phone_key",
  ["buyerId", "contactPhone"],
  { unique: true }
)
@Index("idx_emergency_contacts_buyer", ["buyerId"], {})
@Index("emergency_contacts_pkey", ["id"], { unique: true })
@Entity("emergency_contacts", { schema: "public" })
export class EmergencyContacts {
  @Column("uuid", {
    primary: true,
    name: "id",
    default: () => "gen_random_uuid()",
  })
  id: string;

  @Column("uuid", { name: "buyer_id", unique: true })
  buyerId: string;

  @Column("character varying", { name: "contact_name", length: 255 })
  contactName: string;

  @Column("character varying", {
    name: "contact_phone",
    unique: true,
    length: 20,
  })
  contactPhone: string;

  @Column("character varying", {
    name: "relationship",
    nullable: true,
    length: 50,
  })
  relationship: string | null;

  @Column("boolean", {
    name: "is_active",
    nullable: true,
    default: () => "true",
  })
  isActive: boolean | null;

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

  @ManyToOne(
    () => BuyerInformation,
    (buyerInformation) => buyerInformation.emergencyContacts,
    { onDelete: "CASCADE" }
  )
  @JoinColumn([{ name: "buyer_id", referencedColumnName: "id" }])
  buyer: BuyerInformation;
}
