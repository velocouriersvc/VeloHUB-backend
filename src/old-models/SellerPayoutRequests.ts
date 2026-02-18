import { Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { SellerProfiles } from "./SellerProfiles";

@Index("seller_payout_requests_pkey", ["id"], { unique: true })
@Entity("seller_payout_requests", { schema: "public" })
export class SellerPayoutRequests {
  @Column("uuid", {
    primary: true,
    name: "id",
    default: () => "gen_random_uuid()",
  })
  id: string;

  @Column("numeric", { name: "amount", precision: 10, scale: 2 })
  amount: string;

  @Column("text", {
    name: "status",
    nullable: true,
    default: () => "'pending'",
  })
  status: string | null;

  @Column("text", { name: "notes", nullable: true })
  notes: string | null;

  @Column("timestamp with time zone", {
    name: "requested_at",
    nullable: true,
    default: () => "now()",
  })
  requestedAt: Date | null;

  @Column("timestamp with time zone", { name: "processed_at", nullable: true })
  processedAt: Date | null;

  @ManyToOne(
    () => SellerProfiles,
    (sellerProfiles) => sellerProfiles.sellerPayoutRequests
  )
  @JoinColumn([{ name: "seller_id", referencedColumnName: "id" }])
  seller: SellerProfiles;
}
