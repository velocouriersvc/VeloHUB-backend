import { Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { Profiles } from "./Profiles";

@Index("payment_method_requests_pkey", ["id"], { unique: true })
@Index("idx_payment_method_requests_requested_at", ["requestedAt"], {})
@Index("idx_payment_method_requests_user_id", ["userId"], {})
@Entity("payment_method_requests", { schema: "public" })
export class PaymentMethodRequests {
  @Column("uuid", {
    primary: true,
    name: "id",
    default: () => "gen_random_uuid()",
  })
  id: string;

  @Column("uuid", { name: "user_id", nullable: true })
  userId: string | null;

  @Column("text", { name: "order_id", nullable: true })
  orderId: string | null;

  @Column("text", { name: "requested_method" })
  requestedMethod: string;

  @Column("text", { name: "context", nullable: true })
  context: string | null;

  @Column("timestamp with time zone", {
    name: "requested_at",
    nullable: true,
    default: () => "now()",
  })
  requestedAt: Date | null;

  @Column("timestamp with time zone", {
    name: "created_at",
    nullable: true,
    default: () => "now()",
  })
  createdAt: Date | null;

  @ManyToOne(() => Profiles, (profiles) => profiles.paymentMethodRequests)
  @JoinColumn([{ name: "user_id", referencedColumnName: "id" }])
  user: Profiles;
}
