import { Column, Entity, Index, OneToMany, OneToOne } from "typeorm";
import { PayoutRequests } from "./PayoutRequests";
import { PaystackRecipients } from "./PaystackRecipients";
import { PaystackTransfers } from "./PaystackTransfers";
import { WalletTransactions } from "./WalletTransactions";

@Index("wallets_pkey", ["id"], { unique: true })
@Index("wallets_user_id_key", ["userId"], { unique: true })
@Entity("wallets", { schema: "public" })
export class Wallets {
  @Column("uuid", {
    primary: true,
    name: "id",
    default: () => "gen_random_uuid()",
  })
  id: string;

  @Column("uuid", { name: "user_id", unique: true })
  userId: string;

  @Column("numeric", {
    name: "balance",
    precision: 14,
    scale: 2,
    default: () => "0.00",
  })
  balance: string;

  @Column("numeric", {
    name: "locked_balance",
    precision: 14,
    scale: 2,
    default: () => "0.00",
  })
  lockedBalance: string;

  @Column("text", { name: "currency", default: () => "'GHS'" })
  currency: string;

  @Column("text", { name: "status", default: () => "'active'" })
  status: string;

  @Column("uuid", { name: "last_transaction_id", nullable: true })
  lastTransactionId: string | null;

  @Column("jsonb", { name: "metadata", nullable: true })
  metadata: object | null;

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

  @OneToOne(() => PayoutRequests, (payoutRequests) => payoutRequests.wallet)
  payoutRequests: PayoutRequests;

  @OneToMany(
    () => PaystackRecipients,
    (paystackRecipients) => paystackRecipients.wallet
  )
  paystackRecipients: PaystackRecipients[];

  @OneToMany(
    () => PaystackTransfers,
    (paystackTransfers) => paystackTransfers.wallet
  )
  paystackTransfers: PaystackTransfers[];

  @OneToMany(
    () => WalletTransactions,
    (walletTransactions) => walletTransactions.wallet
  )
  walletTransactions: WalletTransactions[];
}
