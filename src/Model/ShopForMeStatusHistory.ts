import { Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { ShopForMeRequests } from "./ShopForMeRequests";

@Index("shop_for_me_status_history_pkey", ["id"], { unique: true })
@Index("idx_shop_for_me_status_history_request_id_fkey", ["requestId"], {})
@Entity("shop_for_me_status_history", { schema: "public" })
export class ShopForMeStatusHistory {
  @Column("uuid", {
    primary: true,
    name: "id",
    default: () => "gen_random_uuid()",
  })
  id: string;

  @Column("uuid", { name: "request_id", nullable: true })
  requestId: string | null;

  @Column("text", { name: "status" })
  status: string;

  @Column("text", { name: "note", nullable: true })
  note: string | null;

  @Column("timestamp with time zone", {
    name: "created_at",
    nullable: true,
    default: () => "now()",
  })
  createdAt: Date | null;

  @ManyToOne(
    () => ShopForMeRequests,
    (shopForMeRequests) => shopForMeRequests.shopForMeStatusHistories,
    { onDelete: "CASCADE" }
  )
  @JoinColumn([{ name: "request_id", referencedColumnName: "id" }])
  request: ShopForMeRequests;
}
