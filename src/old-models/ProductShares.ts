import { Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { Products } from "./Products";

@Index("product_shares_pkey", ["id"], { unique: true })
@Entity("product_shares", { schema: "public" })
export class ProductShares {
  @Column("uuid", {
    primary: true,
    name: "id",
    default: () => "gen_random_uuid()",
  })
  id: string;

  @Column("text", { name: "share_type", nullable: true })
  shareType: string | null;

  @Column("text", { name: "referrer", nullable: true })
  referrer: string | null;

  @Column("boolean", {
    name: "converted",
    nullable: true,
    default: () => "false",
  })
  converted: boolean | null;

  @Column("timestamp with time zone", {
    name: "clicked_at",
    nullable: true,
    default: () => "now()",
  })
  clickedAt: Date | null;

  @Column("timestamp with time zone", {
    name: "created_at",
    nullable: true,
    default: () => "now()",
  })
  createdAt: Date | null;

  @ManyToOne(() => Products, (products) => products.productShares, {
    onDelete: "CASCADE",
  })
  @JoinColumn([{ name: "product_id", referencedColumnName: "id" }])
  product: Products;
}
