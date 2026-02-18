import { Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { Orders } from "./Orders";

@Index("attachments_pkey", ["id"], { unique: true })
@Entity("attachments", { schema: "public" })
export class Attachments {
  @Column("uuid", {
    primary: true,
    name: "id",
    default: () => "gen_random_uuid()",
  })
  id: string;

  @Column("enum", {
    name: "uploaded_by",
    enum: ["buyer", "merchant", "driver"],
  })
  uploadedBy: "buyer" | "merchant" | "driver";

  @Column("enum", {
    name: "stage",
    enum: ["merchant", "pickup", "delivery", "dispute"],
  })
  stage: "merchant" | "pickup" | "delivery" | "dispute";

  @Column("text", { name: "file_url" })
  fileUrl: string;

  @Column("timestamp with time zone", {
    name: "created_at",
    nullable: true,
    default: () => "now()",
  })
  createdAt: Date | null;

  @ManyToOne(() => Orders, (orders) => orders.attachments, {
    onDelete: "CASCADE",
  })
  @JoinColumn([{ name: "order_id", referencedColumnName: "id" }])
  order: Orders;
}
