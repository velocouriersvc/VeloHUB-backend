import { Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { Orders } from "./Orders";

@Index("order_status_history_pkey", ["id"], { unique: true })
@Index("idx_order_status_history_order_id", ["orderId"], {})
@Entity("order_status_history", { schema: "public" })
export class OrderStatusHistory {
  @Column("uuid", {
    primary: true,
    name: "id",
    default: () => "gen_random_uuid()",
  })
  id: string;

  @Column("uuid", { name: "order_id", nullable: true })
  orderId: string | null;

  @Column("text", { name: "status" })
  status: string;

  @Column("text", { name: "note", nullable: true })
  note: string | null;

  @Column("timestamp with time zone", {
    name: "timestamp",
    nullable: true,
    default: () => "now()",
  })
  timestamp: Date | null;

  @ManyToOne(() => Orders, (orders) => orders.orderStatusHistories, {
    onDelete: "CASCADE",
  })
  @JoinColumn([{ name: "order_id", referencedColumnName: "id" }])
  order: Orders;
}
