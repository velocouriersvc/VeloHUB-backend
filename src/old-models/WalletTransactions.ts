import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
} from "typeorm";
import { PaystackTransfers } from "./PaystackTransfers";
import { Wallets } from "./Wallets";

@Index("wallet_transactions_pkey", ["id"], { unique: true })
@Index(
  "unique_wallet_reference",
  ["referenceId", "referenceType", "walletId"],
  { unique: true }
)
@Entity("wallet_transactions", { schema: "public" })
export class WalletTransactions {
  @Column("uuid", {
    primary: true,
    name: "id",
    default: () => "gen_random_uuid()",
  })
  id: string;

  @Column("uuid", { name: "wallet_id" })
  walletId: string;

  @Column("enum", { name: "direction", enum: ["debit", "credit"] })
  direction: "debit" | "credit";

  @Column("text", { name: "type" })
  type: string;

  @Column("numeric", { name: "amount", precision: 14, scale: 2 })
  amount: string;

  @Column("numeric", { name: "balance_before", precision: 14, scale: 2 })
  balanceBefore: string;

  @Column("numeric", { name: "balance_after", precision: 14, scale: 2 })
  balanceAfter: string;

  @Column("text", { name: "reference_type" })
  referenceType: string;

  @Column("uuid", { name: "reference_id" })
  referenceId: string;

  @Column("text", { name: "external_reference", nullable: true })
  externalReference: string | null;

  @Column("jsonb", { name: "metadata", nullable: true })
  metadata: object | null;

  @Column("timestamp with time zone", {
    name: "created_at",
    default: () => "now()",
  })
  createdAt: Date;

  @OneToMany(
    () => PaystackTransfers,
    (paystackTransfers) => paystackTransfers.walletTransaction
  )
  paystackTransfers: PaystackTransfers[];

  @ManyToOne(() => Wallets, (wallets) => wallets.walletTransactions, {
    onDelete: "RESTRICT",
  })
  @JoinColumn([{ name: "wallet_id", referencedColumnName: "id" }])
  wallet: Wallets;
}
