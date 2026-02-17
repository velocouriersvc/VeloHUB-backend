import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
} from "typeorm";
import { OrderItems } from "./OrderItems";
import { ProductShares } from "./ProductShares";
import { Categories } from "./Categories";
import { Merchants } from "./Merchants";

@Index("idx_products_category", ["categoryId"], {})
@Index("products_pkey", ["id"], { unique: true })
@Index("idx_products_available", ["isAvailable"], {})
@Index("idx_products_merchant", ["merchantId"], {})
@Index("idx_products_tags", ["tags"], {})
@Entity("products", { schema: "public" })
export class Products {
  @Column("uuid", {
    primary: true,
    name: "id",
    default: () => "gen_random_uuid()",
  })
  id: string;

  @Column("uuid", { name: "merchant_id" })
  merchantId: string;

  @Column("uuid", { name: "category_id", nullable: true })
  categoryId: string | null;

  @Column("character varying", { name: "name", length: 255 })
  name: string;

  @Column("text", { name: "description", nullable: true })
  description: string | null;

  @Column("numeric", { name: "price", precision: 10, scale: 2 })
  price: string;

  @Column("numeric", {
    name: "compare_at_price",
    nullable: true,
    precision: 10,
    scale: 2,
  })
  compareAtPrice: string | null;

  @Column("integer", {
    name: "stock_quantity",
    nullable: true,
    default: () => "0",
  })
  stockQuantity: number | null;

  @Column("integer", {
    name: "low_stock_threshold",
    nullable: true,
    default: () => "5",
  })
  lowStockThreshold: number | null;

  @Column("text", { name: "image_urls", nullable: true, array: true })
  imageUrls: string[] | null;

  @Column("boolean", {
    name: "is_available",
    nullable: true,
    default: () => "true",
  })
  isAvailable: boolean | null;

  @Column("boolean", {
    name: "is_featured",
    nullable: true,
    default: () => "false",
  })
  isFeatured: boolean | null;

  @Column("numeric", {
    name: "average_rating",
    nullable: true,
    precision: 3,
    scale: 2,
    default: () => "0.00",
  })
  averageRating: string | null;

  @Column("integer", {
    name: "total_ratings",
    nullable: true,
    default: () => "0",
  })
  totalRatings: number | null;

  @Column("integer", { name: "total_sold", nullable: true, default: () => "0" })
  totalSold: number | null;

  @Column("numeric", {
    name: "weight",
    nullable: true,
    precision: 10,
    scale: 2,
  })
  weight: string | null;

  @Column("jsonb", { name: "dimensions", nullable: true })
  dimensions: object | null;

  @Column("varchar", { name: "tags", nullable: true, array: true })
  tags: string[] | null;

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

  @Column("text", { name: "featured_image", nullable: true })
  featuredImage: string | null;

  @Column("jsonb", { name: "customization_options", nullable: true })
  customizationOptions: object | null;

  @Column("text", { name: "location", nullable: true })
  location: string | null;

  @Column("text", { name: "rental_duration", nullable: true })
  rentalDuration: string | null;

  @Column("numeric", { name: "deposit", nullable: true })
  deposit: string | null;

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

  @OneToMany(() => OrderItems, (orderItems) => orderItems.product)
  orderItems: OrderItems[];

  @OneToMany(() => ProductShares, (productShares) => productShares.product)
  productShares: ProductShares[];

  @ManyToOne(() => Categories, (categories) => categories.products, {
    onDelete: "SET NULL",
  })
  @JoinColumn([{ name: "category_id", referencedColumnName: "id" }])
  category: Categories;

  @ManyToOne(() => Merchants, (merchants) => merchants.products, {
    onDelete: "CASCADE",
  })
  @JoinColumn([{ name: "merchant_id", referencedColumnName: "id" }])
  merchant: Merchants;
}
