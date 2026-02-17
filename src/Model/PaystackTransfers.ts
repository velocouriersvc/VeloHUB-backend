import { Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { Wallets } from "./Wallets";
import { WalletTransactions } from "./WalletTransactions";

@Index("paystack_transfers_pkey", ["id"], { unique: true })
@Index("paystack_transfers_unique_idem", ["idempotencyKey"], { unique: true })
@Entity("paystack_transfers", { schema: "public" })
export class PaystackTransfers {
  @Column("uuid", {
    primary: true,
    name: "id",
    default: () => "gen_random_uuid()",
  })
  id: string;

  @Column("text", { name: "recipient_code" })
  recipientCode: string;

  @Column("numeric", { name: "amount", precision: 14, scale: 2 })
  amount: string;

  @Column("text", { name: "currency" })
  currency: string;

  @Column("text", { name: "reason", nullable: true })
  reason: string | null;

  @Column("enum", {
    name: "status",
    enum: ["pending", "success", "failed", "cancelled"],
    default: () => "'pending'",
  })
  status: "pending" | "success" | "failed" | "cancelled";

  @Column("text", { name: "idempotency_key", unique: true })
  idempotencyKey: string;

  @Column("text", { name: "transfer_code", nullable: true })
  transferCode: string | null;

  @Column("text", { name: "external_reference", nullable: true })
  externalReference: string | null;

  @Column("jsonb", { name: "metadata", nullable: true })
  metadata: object | null;

  @Column("timestamp with time zone", {
    name: "created_at",
    default: () => "now()",
  })
  createdAt: Date;

  @Column("timestamp with time zone", {
    name: "updated_at",
    default: () => "now()",
  })
  updatedAt: Date;

  @Column("timestamp with time zone", { name: "completed_at", nullable: true })
  completedAt: Date | null;

  @ManyToOne(() => Wallets, (wallets) => wallets.paystackTransfers, {
    onDelete: "RESTRICT",
  })
  @JoinColumn([{ name: "wallet_id", referencedColumnName: "id" }])
  wallet: Wallets;

  @ManyToOne(
    () => WalletTransactions,
    (walletTransactions) => walletTransactions.paystackTransfers,
    { onDelete: "RESTRICT" }
  )
  @JoinColumn([{ name: "wallet_transaction_id", referencedColumnName: "id" }])
  walletTransaction: WalletTransactions;
}
