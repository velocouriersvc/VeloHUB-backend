import { Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { Drivers } from "./Drivers";
import { Orders } from "./Orders";

@Index("deliveries_pkey", ["id"], { unique: true })
@Entity("deliveries", { schema: "public" })
export class Deliveries {
  @Column("uuid", {
    primary: true,
    name: "id",
    default: () => "gen_random_uuid()",
  })
  id: string;

  @Column("character varying", {
    name: "pickup_otp",
    nullable: true,
    length: 6,
  })
  pickupOtp: string | null;

  @Column("character varying", {
    name: "delivery_otp",
    nullable: true,
    length: 6,
  })
  deliveryOtp: string | null;

  @Column("boolean", {
    name: "pickup_verified",
    nullable: true,
    default: () => "false",
  })
  pickupVerified: boolean | null;

  @Column("boolean", {
    name: "delivery_verified",
    nullable: true,
    default: () => "false",
  })
  deliveryVerified: boolean | null;

  @Column("timestamp with time zone", {
    name: "estimated_pickup_time",
    nullable: true,
  })
  estimatedPickupTime: Date | null;

  @Column("timestamp with time zone", {
    name: "actual_pickup_time",
    nullable: true,
  })
  actualPickupTime: Date | null;

  @Column("timestamp with time zone", {
    name: "estimated_delivery_time",
    nullable: true,
  })
  estimatedDeliveryTime: Date | null;

  @Column("timestamp with time zone", {
    name: "actual_delivery_time",
    nullable: true,
  })
  actualDeliveryTime: Date | null;

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

  @Column("numeric", { name: "pickup_lat", nullable: true })
  pickupLat: string | null;

  @Column("numeric", { name: "pickup_lng", nullable: true })
  pickupLng: string | null;

  @Column("numeric", { name: "delivery_lat", nullable: true })
  deliveryLat: string | null;

  @Column("numeric", { name: "delivery_lng", nullable: true })
  deliveryLng: string | null;

  @Column("enum", {
    name: "status",
    nullable: true,
    enum: [
      "pending",
      "searching",
      "accepted",
      "driver_arrived",
      "in_progress",
      "completed",
      "cancelled",
      "confirmed",
      "awaiting_confirmation",
      "arrived",
      "picked_up",
      "in_transit",
    ],
  })
  status:
    | "pending"
    | "searching"
    | "accepted"
    | "driver_arrived"
    | "in_progress"
    | "completed"
    | "cancelled"
    | "confirmed"
    | "awaiting_confirmation"
    | "arrived"
    | "picked_up"
    | "in_transit"
    | null;

  @ManyToOne(() => Drivers, (drivers) => drivers.deliveries, {
    onDelete: "SET NULL",
  })
  @JoinColumn([{ name: "driver_id", referencedColumnName: "id" }])
  driver: Drivers;

  @ManyToOne(() => Orders, (orders) => orders.deliveries, {
    onDelete: "CASCADE",
  })
  @JoinColumn([{ name: "order_id", referencedColumnName: "id" }])
  order: Orders;
}
