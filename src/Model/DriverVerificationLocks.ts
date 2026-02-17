import { Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { DriverProfiles } from "./DriverProfiles";
import { Orders } from "./Orders";

@Index(
  "idx_driver_verification_locks_driver_order",
  ["driverId", "orderId"],
  {}
)
@Index(
  "driver_verification_locks_driver_id_order_id_key",
  ["driverId", "orderId"],
  { unique: true }
)
@Index("driver_verification_locks_pkey", ["id"], { unique: true })
@Index("idx_driver_verification_locks_order_id_fkey", ["orderId"], {})
@Entity("driver_verification_locks", { schema: "public" })
export class DriverVerificationLocks {
  @Column("uuid", {
    primary: true,
    name: "id",
    default: () => "gen_random_uuid()",
  })
  id: string;

  @Column("uuid", { name: "driver_id", unique: true })
  driverId: string;

  @Column("uuid", { name: "order_id", unique: true })
  orderId: string;

  @Column("integer", {
    name: "failed_attempts",
    nullable: true,
    default: () => "0",
  })
  failedAttempts: number | null;

  @Column("timestamp with time zone", { name: "locked_until", nullable: true })
  lockedUntil: Date | null;

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
    () => DriverProfiles,
    (driverProfiles) => driverProfiles.driverVerificationLocks,
    { onDelete: "CASCADE" }
  )
  @JoinColumn([{ name: "driver_id", referencedColumnName: "id" }])
  driver: DriverProfiles;

  @ManyToOne(() => Orders, (orders) => orders.driverVerificationLocks, {
    onDelete: "CASCADE",
  })
  @JoinColumn([{ name: "order_id", referencedColumnName: "id" }])
  order: Orders;
}
