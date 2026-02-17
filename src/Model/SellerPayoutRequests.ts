import { Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { SellerProfiles } from "./SellerProfiles";

@Index("idx_seller_payout_requests_created_at", ["createdAt"], {})
@Index("seller_payout_requests_pkey", ["id"], { unique: true })
@Index("idx_seller_payout_requests_seller_id", ["sellerId"], {})
@Index("idx_seller_payout_requests_status", ["status"], {})
@Entity("seller_payout_requests", { schema: "public" })
export class SellerPayoutRequests {
  @Column("uuid", {
    primary: true,
    name: "id",
    default: () => "gen_random_uuid()",
  })
  id: string;

  @Column("uuid", { name: "seller_id" })
  sellerId: string;

  @Column("numeric", { name: "amount" })
  amount: string;

  @Column("text", { name: "status", default: () => "'pending'" })
  status: string;

  @Column("text", { name: "payout_method", nullable: true })
  payoutMethod: string | null;

  @Column("jsonb", { name: "account_details", nullable: true })
  accountDetails: object | null;

  @Column("text", { name: "notes", nullable: true })
  notes: string | null;

  @Column("text", { name: "rejection_reason", nullable: true })
  rejectionReason: string | null;

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

  @Column("timestamp with time zone", { name: "processed_at", nullable: true })
  processedAt: Date | null;

  @Column("timestamp with time zone", { name: "completed_at", nullable: true })
  completedAt: Date | null;

  @ManyToOne(
    () => SellerProfiles,
    (sellerProfiles) => sellerProfiles.sellerPayoutRequests,
    { onDelete: "CASCADE" }
  )
  @JoinColumn([{ name: "seller_id", referencedColumnName: "id" }])
  seller: SellerProfiles;
}
