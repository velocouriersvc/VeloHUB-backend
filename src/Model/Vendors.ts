import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
} from "typeorm";
import { Products } from "./Products";
import { StoreShares } from "./StoreShares";
import { Profiles } from "./Profiles";

@Index("idx_vendors_category", ["category"], {})
@Index("vendors_pkey", ["id"], { unique: true })
@Index("idx_vendors_seller_id", ["sellerId"], {})
@Index("vendors_store_slug_key", ["storeSlug"], { unique: true })
@Index("idx_vendors_store_slug", ["storeSlug"], {})
@Entity("vendors", { schema: "public" })
export class Vendors {
  @Column("uuid", {
    primary: true,
    name: "id",
    default: () => "gen_random_uuid()",
  })
  id: string;

  @Column("uuid", { name: "seller_id", nullable: true })
  sellerId: string | null;

  @Column("text", { name: "name" })
  name: string;

  @Column("text", { name: "description", nullable: true })
  description: string | null;

  @Column("text", { name: "image", nullable: true })
  image: string | null;

  @Column("numeric", { name: "rating", nullable: true, default: () => "0.0" })
  rating: string | null;

  @Column("integer", {
    name: "total_reviews",
    nullable: true,
    default: () => "0",
  })
  totalReviews: number | null;

  @Column("text", { name: "category" })
  category: string;

  @Column("numeric", { name: "distance", nullable: true })
  distance: string | null;

  @Column("text", { name: "delivery_time", nullable: true })
  deliveryTime: string | null;

  @Column("boolean", { name: "is_open", nullable: true, default: () => "true" })
  isOpen: boolean | null;

  @Column("text", { name: "location", nullable: true })
  location: string | null;

  @Column("jsonb", { name: "coordinates", nullable: true })
  coordinates: object | null;

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

  @Column("text", { name: "store_slug", nullable: true, unique: true })
  storeSlug: string | null;

  @OneToMany(() => Products, (products) => products.vendor)
  products: Products[];

  @OneToMany(() => StoreShares, (storeShares) => storeShares.vendor)
  storeShares: StoreShares[];

  @ManyToOne(() => Profiles, (profiles) => profiles.vendors)
  @JoinColumn([{ name: "seller_id", referencedColumnName: "id" }])
  seller: Profiles;
}
