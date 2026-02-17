import { Column, Entity, Index, OneToMany } from "typeorm";
import { Categories } from "./Categories";

@Index("business_types_pkey", ["id"], { unique: true })
@Index("idx_business_types_name", ["name"], {})
@Index("business_types_name_key", ["name"], { unique: true })
@Entity("business_types", { schema: "public" })
export class BusinessTypes {
  @Column("uuid", {
    primary: true,
    name: "id",
    default: () => "gen_random_uuid()",
  })
  id: string;

  @Column("character varying", { name: "name", unique: true, length: 100 })
  name: string;

  @Column("text", { name: "description", nullable: true })
  description: string | null;

  @Column("boolean", {
    name: "is_active",
    nullable: true,
    default: () => "true",
  })
  isActive: boolean | null;

  @Column("timestamp with time zone", {
    name: "created_at",
    nullable: true,
    default: () => "now()",
  })
  createdAt: Date | null;

  @OneToMany(() => Categories, (categories) => categories.businessType)
  categories: Categories[];
}
