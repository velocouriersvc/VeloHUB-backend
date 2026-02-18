import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
} from "typeorm";
import { Profiles } from "./Profiles";
import { Withdrawals } from "./Withdrawals";

@Index("payment_methods_pkey", ["id"], { unique: true })
@Entity("payment_methods", { schema: "public" })
export class PaymentMethods {
  @Column("uuid", {
    primary: true,
    name: "id",
    default: () => "gen_random_uuid()",
  })
  id: string;

  @Column("text", { name: "type" })
  type: string;

  @Column("text", { name: "provider" })
  provider: string;

  @Column("text", { name: "label" })
  label: string;

  @Column("jsonb", { name: "details" })
  details: object;

  @Column("boolean", {
    name: "is_default",
    nullable: true,
    default: () => "false",
  })
  isDefault: boolean | null;

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

  @ManyToOne(() => Profiles, (profiles) => profiles.paymentMethods, {
    onDelete: "CASCADE",
  })
  @JoinColumn([{ name: "user_id", referencedColumnName: "id" }])
  user: Profiles;

  @OneToMany(() => Withdrawals, (withdrawals) => withdrawals.paymentMethod)
  withdrawals: Withdrawals[];
}
