import { Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { Orders } from "./Orders";
import { Vendors } from "./Vendors";

@Index("idx_store_shares_clicked_at", ["clickedAt"], {})
@Index("store_shares_pkey", ["id"], { unique: true })
@Index("idx_store_shares_vendor_id", ["vendorId"], {})
@Entity("store_shares", { schema: "public" })
export class StoreShares {
  @Column("uuid", {
    primary: true,
    name: "id",
    default: () => "gen_random_uuid()",
  })
  id: string;

  @Column("uuid", { name: "vendor_id" })
  vendorId: string;

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

  @ManyToOne(() => Orders, (orders) => orders.storeShares)
  @JoinColumn([{ name: "conversion_order_id", referencedColumnName: "id" }])
  conversionOrder: Orders;

  @ManyToOne(() => Vendors, (vendors) => vendors.storeShares, {
    onDelete: "CASCADE",
  })
  @JoinColumn([{ name: "vendor_id", referencedColumnName: "id" }])
  vendor: Vendors;
}
