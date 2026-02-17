import { Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { Merchants } from "./Merchants";

@Index("store_shares_pkey", ["id"], { unique: true })
@Entity("store_shares", { schema: "public" })
export class StoreShares {
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

  @ManyToOne(() => Merchants, (merchants) => merchants.storeShares, {
    onDelete: "CASCADE",
  })
  @JoinColumn([{ name: "vendor_id", referencedColumnName: "id" }])
  vendor: Merchants;
}
