import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
} from "typeorm";
import { ShopForMeItems } from "./ShopForMeItems";
import { Profiles } from "./Profiles";
import { DriverProfiles } from "./DriverProfiles";
import { ShopForMeStatusHistory } from "./ShopForMeStatusHistory";

@Index("idx_shop_for_me_requests_buyer_id_fkey", ["buyerId"], {})
@Index("idx_shop_for_me_requests_driver_id_fkey", ["driverId"], {})
@Index("shop_for_me_requests_pkey", ["id"], { unique: true })
@Entity("shop_for_me_requests", { schema: "public" })
export class ShopForMeRequests {
  @Column("uuid", {
    primary: true,
    name: "id",
    default: () => "gen_random_uuid()",
  })
  id: string;

  @Column("uuid", { name: "buyer_id", nullable: true })
  buyerId: string | null;

  @Column("text", { name: "store_name", nullable: true })
  storeName: string | null;

  @Column("text", { name: "store_location", nullable: true })
  storeLocation: string | null;

  @Column("jsonb", { name: "shopping_list", default: [] })
  shoppingList: object;

  @Column("text", { name: "additional_notes", nullable: true })
  additionalNotes: string | null;

  @Column("numeric", {
    name: "estimated_budget",
    nullable: true,
    precision: 10,
    scale: 2,
  })
  estimatedBudget: string | null;

  @Column("numeric", {
    name: "actual_total",
    nullable: true,
    precision: 10,
    scale: 2,
  })
  actualTotal: string | null;

  @Column("text", { name: "status", default: () => "'pending'" })
  status: string;

  @Column("uuid", { name: "driver_id", nullable: true })
  driverId: string | null;

  @Column("text", { name: "delivery_address" })
  deliveryAddress: string;

  @Column("jsonb", { name: "delivery_coordinates", nullable: true })
  deliveryCoordinates: object | null;

  @Column("text", {
    name: "payment_method",
    nullable: true,
    default: () => "'cash'",
  })
  paymentMethod: string | null;

  @Column("text", {
    name: "payment_status",
    nullable: true,
    default: () => "'pending'",
  })
  paymentStatus: string | null;

  @Column("numeric", {
    name: "service_fee",
    nullable: true,
    precision: 10,
    scale: 2,
    default: () => "0",
  })
  serviceFee: string | null;

  @Column("numeric", {
    name: "delivery_fee",
    nullable: true,
    precision: 10,
    scale: 2,
    default: () => "0",
  })
  deliveryFee: string | null;

  @Column("numeric", {
    name: "total_amount",
    nullable: true,
    precision: 10,
    scale: 2,
    default: () => "0",
  })
  totalAmount: string | null;

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

  @Column("timestamp with time zone", { name: "completed_at", nullable: true })
  completedAt: Date | null;

  @OneToMany(() => ShopForMeItems, (shopForMeItems) => shopForMeItems.request)
  shopForMeItems: ShopForMeItems[];

  @ManyToOne(() => Profiles, (profiles) => profiles.shopForMeRequests, {
    onDelete: "CASCADE",
  })
  @JoinColumn([{ name: "buyer_id", referencedColumnName: "id" }])
  buyer: Profiles;

  @ManyToOne(
    () => DriverProfiles,
    (driverProfiles) => driverProfiles.shopForMeRequests,
    { onDelete: "SET NULL" }
  )
  @JoinColumn([{ name: "driver_id", referencedColumnName: "id" }])
  driver: DriverProfiles;

  @OneToMany(
    () => ShopForMeStatusHistory,
    (shopForMeStatusHistory) => shopForMeStatusHistory.request
  )
  shopForMeStatusHistories: ShopForMeStatusHistory[];
}
