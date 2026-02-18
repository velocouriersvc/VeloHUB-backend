import { Column, Entity, Index, JoinColumn, OneToOne } from "typeorm";
import { Wallets } from "./Wallets";

@Index("payout_requests_pkey", ["id"], { unique: true })
@Index("payout_requests_reference_key", ["reference"], { unique: true })
@Index("one_pending_payout_per_wallet", ["walletId"], { unique: true })
@Entity("payout_requests", { schema: "public" })
export class PayoutRequests {
  @Column("uuid", {
    primary: true,
    name: "id",
    default: () => "gen_random_uuid()",
  })
  id: string;

  @Column("uuid", { name: "wallet_id" })
  walletId: string;

  @Column("uuid", { name: "user_id" })
  userId: string;

  @Column("numeric", { name: "amount", precision: 14, scale: 2 })
  amount: string;

  @Column("text", { name: "status" })
  status: string;

  @Column("text", { name: "failure_reason", nullable: true })
  failureReason: string | null;

  @Column("text", { name: "reference", unique: true })
  reference: string;

  @Column("timestamp with time zone", {
    name: "created_at",
    nullable: true,
    default: () => "now()",
  })
  createdAt: Date | null;

  @Column("text", { name: "paystack_reference", nullable: true })
  paystackReference: string | null;

  @Column("uuid", { name: "recipient_id", nullable: true })
  recipientId: string | null;

  @Column("text", { name: "recipient_type", nullable: true })
  recipientType: string | null;

  @OneToOne(() => Wallets, (wallets) => wallets.payoutRequests)
  @JoinColumn([{ name: "wallet_id", referencedColumnName: "id" }])
  wallet: Wallets;
}
