import { Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { PaymentMethods } from "./PaymentMethods";
import { Profiles } from "./Profiles";

@Index("withdrawals_pkey", ["id"], { unique: true })
@Entity("withdrawals", { schema: "public" })
export class Withdrawals {
  @Column("uuid", {
    primary: true,
    name: "id",
    default: () => "gen_random_uuid()",
  })
  id: string;

  @Column("numeric", { name: "amount", precision: 12, scale: 2 })
  amount: string;

  @Column("text", { name: "status", default: () => "'pending'" })
  status: string;

  @Column("text", { name: "reference", nullable: true })
  reference: string | null;

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

  @ManyToOne(
    () => PaymentMethods,
    (paymentMethods) => paymentMethods.withdrawals
  )
  @JoinColumn([{ name: "payment_method_id", referencedColumnName: "id" }])
  paymentMethod: PaymentMethods;

  @ManyToOne(() => Profiles, (profiles) => profiles.withdrawals, {
    onDelete: "CASCADE",
  })
  @JoinColumn([{ name: "user_id", referencedColumnName: "id" }])
  user: Profiles;
}
