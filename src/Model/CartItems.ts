import { Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { DeliveryServices } from "./DeliveryServices";
import { Profiles } from "./Profiles";

@Index("cart_items_pkey", ["id"], { unique: true })
@Index("cart_items_user_id_service_id_key", ["serviceId", "userId"], {
  unique: true,
})
@Index("idx_cart_items_service_id_fkey", ["serviceId"], {})
@Index("idx_cart_items_user", ["userId"], {})
@Entity("cart_items", { schema: "public" })
export class CartItems {
  @Column("uuid", {
    primary: true,
    name: "id",
    default: () => "gen_random_uuid()",
  })
  id: string;

  @Column("uuid", { name: "user_id", nullable: true, unique: true })
  userId: string | null;

  @Column("uuid", { name: "service_id", nullable: true, unique: true })
  serviceId: string | null;

  @Column("integer", { name: "quantity", default: () => "1" })
  quantity: number;

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
    () => DeliveryServices,
    (deliveryServices) => deliveryServices.cartItems,
    { onDelete: "CASCADE" }
  )
  @JoinColumn([{ name: "service_id", referencedColumnName: "id" }])
  service: DeliveryServices;

  @ManyToOne(() => Profiles, (profiles) => profiles.cartItems, {
    onDelete: "CASCADE",
  })
  @JoinColumn([{ name: "user_id", referencedColumnName: "id" }])
  user: Profiles;
}
