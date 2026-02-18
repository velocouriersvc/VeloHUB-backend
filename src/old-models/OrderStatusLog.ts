import { Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { Orders } from "./Orders";

@Index("order_status_log_pkey", ["id"], { unique: true })
@Entity("order_status_log", { schema: "public" })
export class OrderStatusLog {
  @Column("uuid", {
    primary: true,
    name: "id",
    default: () => "gen_random_uuid()",
  })
  id: string;

  @Column("enum", {
    name: "old_status",
    nullable: true,
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
  oldStatus:
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
    | "awaiting_confirmation"
    | null;

  @Column("enum", {
    name: "new_status",
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
  newStatus:
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

  @Column("uuid", { name: "changed_by", nullable: true })
  changedBy: string | null;

  @Column("timestamp with time zone", {
    name: "changed_at",
    nullable: true,
    default: () => "now()",
  })
  changedAt: Date | null;

  @ManyToOne(() => Orders, (orders) => orders.orderStatusLogs, {
    onDelete: "CASCADE",
  })
  @JoinColumn([{ name: "order_id", referencedColumnName: "id" }])
  order: Orders;
}
