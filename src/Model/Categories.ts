import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
} from "typeorm";
import { BusinessTypes } from "./BusinessTypes";
import { Products } from "./Products";

@Index("idx_business_type_categories", ["businessTypeId"], {})
@Index("categories_pkey", ["id"], { unique: true })
@Index("idx_categories_slug", ["slug"], {})
@Index("categories_slug_key", ["slug"], { unique: true })
@Entity("categories", { schema: "public" })
export class Categories {
  @Column("uuid", {
    primary: true,
    name: "id",
    default: () => "gen_random_uuid()",
  })
  id: string;

  @Column("uuid", { name: "business_type_id", nullable: true })
  businessTypeId: string | null;

  @Column("character varying", { name: "name", length: 100 })
  name: string;

  @Column("text", { name: "slug", unique: true })
  slug: string;

  @Column("text", { name: "description", nullable: true })
  description: string | null;

  @Column("text", { name: "icon_url", nullable: true })
  iconUrl: string | null;

  @Column("integer", {
    name: "display_order",
    nullable: true,
    default: () => "0",
  })
  displayOrder: number | null;

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

  @ManyToOne(() => BusinessTypes, (businessTypes) => businessTypes.categories, {
    onDelete: "SET NULL",
  })
  @JoinColumn([{ name: "business_type_id", referencedColumnName: "id" }])
  businessType: BusinessTypes;

  @ManyToOne(() => Categories, (categories) => categories.categories, {
    onDelete: "SET NULL",
  })
  @JoinColumn([{ name: "parent_category_id", referencedColumnName: "id" }])
  parentCategory: Categories;

  @OneToMany(() => Categories, (categories) => categories.parentCategory)
  categories: Categories[];

  @OneToMany(() => Products, (products) => products.category)
  products: Products[];
}
