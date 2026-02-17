import { Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { Profiles } from "./Profiles";

@Index("idx_inventory_items_category", ["category"], {})
@Index("inventory_items_pkey", ["id"], { unique: true })
@Index("idx_inventory_items_location", ["location"], {})
@Index("idx_inventory_items_seller_id", ["sellerId"], {})
@Index("idx_inventory_items_status", ["status"], {})
@Entity("inventory_items", { schema: "public" })
export class InventoryItems {
  @Column("uuid", {
    primary: true,
    name: "id",
    default: () => "gen_random_uuid()",
  })
  id: string;

  @Column("uuid", { name: "seller_id", nullable: true })
  sellerId: string | null;

  @Column("text", { name: "category" })
  category: string;

  @Column("text", { name: "name" })
  name: string;

  @Column("text", { name: "description", nullable: true })
  description: string | null;

  @Column("numeric", { name: "price" })
  price: string;

  @Column("integer", { name: "quantity", nullable: true, default: () => "0" })
  quantity: number | null;

  @Column("text", { name: "location", nullable: true })
  location: string | null;

  @Column("jsonb", { name: "images", nullable: true, default: [] })
  images: object | null;

  @Column("jsonb", { name: "tags", nullable: true, default: [] })
  tags: object | null;

  @Column("text", { name: "rental_duration", nullable: true })
  rentalDuration: string | null;

  @Column("numeric", { name: "deposit", nullable: true })
  deposit: string | null;

  @Column("jsonb", { name: "availability_dates", nullable: true })
  availabilityDates: object | null;

  @Column("text", { name: "item_type", nullable: true })
  itemType: string | null;

  @Column("text", { name: "product_type", nullable: true })
  productType: string | null;

  @Column("date", { name: "expiration_date", nullable: true })
  expirationDate: string | null;

  @Column("text", { name: "dosage_info", nullable: true })
  dosageInfo: string | null;

  @Column("boolean", {
    name: "prescription_required",
    nullable: true,
    default: () => "false",
  })
  prescriptionRequired: boolean | null;

  @Column("text", { name: "regulatory_notes", nullable: true })
  regulatoryNotes: string | null;

  @Column("text", { name: "status", nullable: true, default: () => "'active'" })
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

  @Column("text", { name: "generic_name", nullable: true })
  genericName: string | null;

  @Column("jsonb", { name: "active_ingredients", nullable: true, default: [] })
  activeIngredients: object | null;

  @Column("text", { name: "dosage_form", nullable: true })
  dosageForm: string | null;

  @Column("text", { name: "strength", nullable: true })
  strength: string | null;

  @Column("text", { name: "manufacturer", nullable: true })
  manufacturer: string | null;

  @Column("jsonb", { name: "uses", nullable: true, default: [] })
  uses: object | null;

  @Column("text", { name: "dosage", nullable: true })
  dosage: string | null;

  @Column("text", { name: "directions", nullable: true })
  directions: string | null;

  @Column("jsonb", { name: "warnings", nullable: true, default: [] })
  warnings: object | null;

  @Column("jsonb", { name: "side_effects", nullable: true, default: [] })
  sideEffects: object | null;

  @Column("jsonb", { name: "contraindications", nullable: true, default: [] })
  contraindications: object | null;

  @Column("jsonb", { name: "interactions", nullable: true, default: [] })
  interactions: object | null;

  @Column("text", { name: "storage", nullable: true })
  storage: string | null;

  @Column("text", { name: "expiry_info", nullable: true })
  expiryInfo: string | null;

  @ManyToOne(() => Profiles, (profiles) => profiles.inventoryItems, {
    onDelete: "CASCADE",
  })
  @JoinColumn([{ name: "seller_id", referencedColumnName: "id" }])
  seller: Profiles;
}
