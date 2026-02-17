import { Column, Entity, Index, OneToMany } from "typeorm";
import { CartItems } from "./CartItems";

@Index("idx_delivery_services_category", ["category"], {})
@Index("delivery_services_pkey", ["id"], { unique: true })
@Index("idx_delivery_services_active", ["isActive"], {})
@Entity("delivery_services", { schema: "public" })
export class DeliveryServices {
  @Column("uuid", {
    primary: true,
    name: "id",
    default: () => "gen_random_uuid()",
  })
  id: string;

  @Column("text", { name: "name" })
  name: string;

  @Column("text", { name: "description", nullable: true })
  description: string | null;

  @Column("numeric", { name: "price" })
  price: string;

  @Column("text", { name: "category" })
  category: string;

  @Column("text", { name: "image_url", nullable: true })
  imageUrl: string | null;

  @Column("jsonb", { name: "features", nullable: true, default: [] })
  features: object | null;

  @Column("boolean", {
    name: "is_active",
    nullable: true,
    default: () => "true",
  })
  isActive: boolean | null;

  @Column("integer", { name: "sort_order", nullable: true, default: () => "0" })
  sortOrder: number | null;

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

  @OneToMany(() => CartItems, (cartItems) => cartItems.service)
  cartItems: CartItems[];
}
