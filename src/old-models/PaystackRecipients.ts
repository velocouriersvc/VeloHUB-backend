import { Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { Wallets } from "./Wallets";

@Index("paystack_recipients_pkey", ["id"], { unique: true })
@Index("paystack_recipients_recipient_code_key", ["recipientCode"], {
  unique: true,
})
@Entity("paystack_recipients", { schema: "public" })
export class PaystackRecipients {
  @Column("uuid", {
    primary: true,
    name: "id",
    default: () => "gen_random_uuid()",
  })
  id: string;

  @Column("uuid", { name: "user_id" })
  userId: string;

  @Column("text", { name: "recipient_code", unique: true })
  recipientCode: string;

  @Column("text", { name: "bank_name" })
  bankName: string;

  @Column("text", { name: "account_name" })
  accountName: string;

  @Column("text", { name: "account_number" })
  accountNumber: string;

  @Column("text", { name: "status", default: () => "'active'" })
  status: string;

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

  @Column("text", {
    name: "recipient_type",
    nullable: true,
    default: () => "'bank'",
  })
  recipientType: string | null;

  @Column("text", { name: "phone_number", nullable: true })
  phoneNumber: string | null;

  @Column("text", { name: "provider", nullable: true })
  provider: string | null;

  @Column("text", { name: "currency", default: () => "'GHS'" })
  currency: string;

  @ManyToOne(() => Wallets, (wallets) => wallets.paystackRecipients)
  @JoinColumn([{ name: "wallet_id", referencedColumnName: "id" }])
  wallet: Wallets;
}
