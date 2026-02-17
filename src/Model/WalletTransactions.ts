import { Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { Profiles } from "./Profiles";

@Index("wallet_transactions_pkey", ["id"], { unique: true })
@Index("idx_wallet_transactions_profile_id_fkey", ["profileId"], {})
@Entity("wallet_transactions", { schema: "public" })
export class WalletTransactions {
  @Column("uuid", {
    primary: true,
    name: "id",
    default: () => "gen_random_uuid()",
  })
  id: string;

  @Column("uuid", { name: "profile_id" })
  profileId: string;

  @Column("text", { name: "transaction_type" })
  transactionType: string;

  @Column("numeric", { name: "amount" })
  amount: string;

  @Column("numeric", { name: "balance_after" })
  balanceAfter: string;

  @Column("text", { name: "description", nullable: true })
  description: string | null;

  @Column("uuid", { name: "reference_id", nullable: true })
  referenceId: string | null;

  @Column("timestamp with time zone", {
    name: "created_at",
    nullable: true,
    default: () => "now()",
  })
  createdAt: Date | null;

  @ManyToOne(() => Profiles, (profiles) => profiles.walletTransactions, {
    onDelete: "CASCADE",
  })
  @JoinColumn([{ name: "profile_id", referencedColumnName: "id" }])
  profile: Profiles;
}
