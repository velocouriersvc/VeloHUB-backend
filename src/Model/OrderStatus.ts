import { Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { Orders } from "./Orders";

@Index("order_status_pkey", ["id"], { unique: true })
@Entity("order_status", { schema: "public" })
export class OrderStatus {
  @Column("uuid", {
    primary: true,
    name: "id",
    default: () => "gen_random_uuid()",
  })
  id: string;

  @Column("enum", {
    name: "status",
    enum: [
      "pending",
      "confirmed",
      "preparing_order",
      "ready_for_pickup",
      "driver_assigned",
      "picked_up",
      "in_transit",
      "delivered",
      "cancelled",
      "refunded",
      "pending_payment",
      "paid",
      "awaiting_confirmation",
    ],
  })
  status:
    | "pending"
    | "confirmed"
    | "preparing_order"
    | "ready_for_pickup"
    | "driver_assigned"
    | "picked_up"
    | "in_transit"
    | "delivered"
    | "cancelled"
    | "refunded"
    | "pending_payment"
    | "paid"
    | "awaiting_confirmation";

  @Column("timestamp with time zone", {
    name: "created_at",
    nullable: true,
    default: () => "now()",
  })
  createdAt: Date | null;

  @ManyToOne(() => Orders, (orders) => orders.orderStatuses, {
    onDelete: "CASCADE",
  })
  @JoinColumn([{ name: "order_id", referencedColumnName: "id" }])
  order: Orders;
}
