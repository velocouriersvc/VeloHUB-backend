import { Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { ShopForMeRequests } from "./ShopForMeRequests";

@Index("shop_for_me_items_pkey", ["id"], { unique: true })
@Index("idx_shop_for_me_items_request_id_fkey", ["requestId"], {})
@Entity("shop_for_me_items", { schema: "public" })
export class ShopForMeItems {
  @Column("uuid", {
    primary: true,
    name: "id",
    default: () => "gen_random_uuid()",
  })
  id: string;

  @Column("uuid", { name: "request_id", nullable: true })
  requestId: string | null;

  @Column("text", { name: "item_name" })
  itemName: string;

  @Column("text", { name: "quantity" })
  quantity: string;

  @Column("numeric", {
    name: "estimated_price",
    nullable: true,
    precision: 10,
    scale: 2,
  })
  estimatedPrice: string | null;

  @Column("numeric", {
    name: "actual_price",
    nullable: true,
    precision: 10,
    scale: 2,
  })
  actualPrice: string | null;

  @Column("text", { name: "notes", nullable: true })
  notes: string | null;

  @Column("boolean", { name: "found", nullable: true, default: () => "false" })
  found: boolean | null;

  @Column("timestamp with time zone", {
    name: "created_at",
    nullable: true,
    default: () => "now()",
  })
  createdAt: Date | null;

  @ManyToOne(
    () => ShopForMeRequests,
    (shopForMeRequests) => shopForMeRequests.shopForMeItems,
    { onDelete: "CASCADE" }
  )
  @JoinColumn([{ name: "request_id", referencedColumnName: "id" }])
  request: ShopForMeRequests;
}
