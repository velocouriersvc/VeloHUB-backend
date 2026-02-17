import { Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { Orders } from "./Orders";
import { Products } from "./Products";

@Index("idx_product_shares_clicked_at", ["clickedAt"], {})
@Index("product_shares_pkey", ["id"], { unique: true })
@Index("idx_product_shares_product_id", ["productId"], {})
@Entity("product_shares", { schema: "public" })
export class ProductShares {
  @Column("uuid", {
    primary: true,
    name: "id",
    default: () => "gen_random_uuid()",
  })
  id: string;

  @Column("uuid", { name: "product_id" })
  productId: string;

  @Column("text", { name: "share_type" })
  shareType: string;

  @Column("text", { name: "referrer", nullable: true })
  referrer: string | null;

  @Column("text", { name: "user_agent", nullable: true })
  userAgent: string | null;

  @Column("inet", { name: "ip_address", nullable: true })
  ipAddress: string | null;

  @Column("timestamp with time zone", {
    name: "clicked_at",
    nullable: true,
    default: () => "now()",
  })
  clickedAt: Date | null;

  @Column("boolean", {
    name: "converted",
    nullable: true,
    default: () => "false",
  })
  converted: boolean | null;

  @Column("timestamp with time zone", {
    name: "created_at",
    nullable: true,
    default: () => "now()",
  })
  createdAt: Date | null;

  @ManyToOne(() => Orders, (orders) => orders.productShares)
  @JoinColumn([{ name: "conversion_order_id", referencedColumnName: "id" }])
  conversionOrder: Orders;

  @ManyToOne(() => Products, (products) => products.productShares, {
    onDelete: "CASCADE",
  })
  @JoinColumn([{ name: "product_id", referencedColumnName: "id" }])
  product: Products;
}
