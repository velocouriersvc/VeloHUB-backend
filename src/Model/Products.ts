import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
} from "typeorm";
import { ProductShares } from "./ProductShares";
import { Profiles } from "./Profiles";
import { Vendors } from "./Vendors";

@Index("idx_products_category", ["category"], {})
@Index("products_pkey", ["id"], { unique: true })
@Index("idx_products_in_stock", ["inStock"], {})
@Index("idx_products_product_slug", ["productSlug"], {})
@Index("products_product_slug_key", ["productSlug"], { unique: true })
@Index("idx_products_seller_id", ["sellerId"], {})
@Index("idx_products_vendor_id", ["vendorId"], {})
@Entity("products", { schema: "public" })
export class Products {
  @Column("uuid", {
    primary: true,
    name: "id",
    default: () => "gen_random_uuid()",
  })
  id: string;

  @Column("uuid", { name: "vendor_id", nullable: true })
  vendorId: string | null;

  @Column("uuid", { name: "seller_id", nullable: true })
  sellerId: string | null;

  @Column("text", { name: "name" })
  name: string;

  @Column("text", { name: "description", nullable: true })
  description: string | null;

  @Column("numeric", { name: "price" })
  price: string;

  @Column("text", { name: "image", nullable: true })
  image: string | null;

  @Column("text", { name: "category" })
  category: string;

  @Column("numeric", { name: "rating", nullable: true, default: () => "0.0" })
  rating: string | null;

  @Column("integer", {
    name: "total_reviews",
    nullable: true,
    default: () => "0",
  })
  totalReviews: number | null;

  @Column("boolean", {
    name: "in_stock",
    nullable: true,
    default: () => "true",
  })
  inStock: boolean | null;

  @Column("integer", { name: "stock", nullable: true, default: () => "0" })
  stock: number | null;

  @Column("integer", {
    name: "low_stock_threshold",
    nullable: true,
    default: () => "10",
  })
  lowStockThreshold: number | null;

  @Column("text", { name: "sku", nullable: true })
  sku: string | null;

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

  @Column("boolean", {
    name: "public_visible",
    nullable: true,
    default: () => "true",
  })
  publicVisible: boolean | null;

  @Column("text", { name: "product_slug", nullable: true, unique: true })
  productSlug: string | null;

  @Column("boolean", {
    name: "is_wholesale",
    nullable: true,
    default: () => "false",
  })
  isWholesale: boolean | null;

  @OneToMany(() => ProductShares, (productShares) => productShares.product)
  productShares: ProductShares[];

  @ManyToOne(() => Profiles, (profiles) => profiles.products)
  @JoinColumn([{ name: "seller_id", referencedColumnName: "id" }])
  seller: Profiles;

  @ManyToOne(() => Vendors, (vendors) => vendors.products, {
    onDelete: "CASCADE",
  })
  @JoinColumn([{ name: "vendor_id", referencedColumnName: "id" }])
  vendor: Vendors;
}
