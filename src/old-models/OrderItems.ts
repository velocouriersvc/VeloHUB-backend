import { Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { Merchants } from "./Merchants";
import { Orders } from "./Orders";
import { Products } from "./Products";

@Index("order_items_pkey", ["id"], { unique: true })
@Entity("order_items", { schema: "public" })
export class OrderItems {
  @Column("uuid", {
    primary: true,
    name: "id",
    default: () => "gen_random_uuid()",
  })
  id: string;

  @Column("text", { name: "product_name", nullable: true })
  productName: string | null;

  @Column("text", { name: "product_description", nullable: true })
  productDescription: string | null;

  @Column("text", { name: "product_image_url", nullable: true })
  productImageUrl: string | null;

  @Column("numeric", { name: "unit_price", precision: 12, scale: 2 })
  unitPrice: string;

  @Column("integer", { name: "quantity" })
  quantity: number;

  @Column("numeric", { name: "total_price", precision: 12, scale: 2 })
  totalPrice: string;

  @Column("text", { name: "variant_name", nullable: true })
  variantName: string | null;

  @Column("text", { name: "variant_value", nullable: true })
  variantValue: string | null;

  @Column("timestamp with time zone", {
    name: "created_at",
    nullable: true,
    default: () => "now()",
  })
  createdAt: Date | null;

  @Column("jsonb", { name: "customizations", nullable: true })
  customizations: object | null;

  @ManyToOne(() => Merchants, (merchants) => merchants.orderItems, {
    onDelete: "SET NULL",
  })
  @JoinColumn([{ name: "merchant_id", referencedColumnName: "id" }])
  merchant: Merchants;

  @ManyToOne(() => Orders, (orders) => orders.orderItems, {
    onDelete: "CASCADE",
  })
  @JoinColumn([{ name: "order_id", referencedColumnName: "id" }])
  order: Orders;

  @ManyToOne(() => Products, (products) => products.orderItems, {
    onDelete: "SET NULL",
  })
  @JoinColumn([{ name: "product_id", referencedColumnName: "id" }])
  product: Products;
}
