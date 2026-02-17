import { Column, Entity, Index, PrimaryGeneratedColumn } from "typeorm";

@Index("Velo Table_pkey", ["id"], { unique: true })
@Entity("Velo Table", { schema: "public" })
export class VeloTable {
  @PrimaryGeneratedColumn({ type: "bigint", name: "id" })
  id: string;

  @Column("timestamp with time zone", {
    name: "created_at",
    default: () => "now()",
  })
  createdAt: Date;
}
