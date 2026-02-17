import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
} from "typeorm";
import { Orders } from "./Orders";
import { Profiles } from "./Profiles";

@Index("payments_pkey", ["id"], { unique: true })
@Index("idx_payments_order_id", ["orderId"], {})
@Index("idx_payments_user_id", ["userId"], {})
@Entity("payments", { schema: "public" })
export class Payments {
  @Column("uuid", {
    primary: true,
    name: "id",
    default: () => "gen_random_uuid()",
  })
  id: string;

  @Column("uuid", { name: "order_id", nullable: true })
  orderId: string | null;

  @Column("uuid", { name: "user_id", nullable: true })
  userId: string | null;

  @Column("numeric", { name: "amount" })
  amount: string;

  @Column("text", { name: "payment_method", nullable: true })
  paymentMethod: string | null;

  @Column("text", {
    name: "status",
    nullable: true,
    default: () => "'pending'",
  })
  status: string | null;

  @Column("text", { name: "transaction_id", nullable: true })
  transactionId: string | null;

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

  @OneToMany(() => Orders, (orders) => orders.payment)
  orders: Orders[];

  @ManyToOne(() => Orders, (orders) => orders.payments)
  @JoinColumn([{ name: "order_id", referencedColumnName: "id" }])
  order: Orders;

  @ManyToOne(() => Profiles, (profiles) => profiles.payments)
  @JoinColumn([{ name: "user_id", referencedColumnName: "id" }])
  user: Profiles;
}
