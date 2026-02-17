import { Column, Entity, Index } from "typeorm";

@Index("system_config_pkey", ["key"], { unique: true })
@Entity("system_config", { schema: "public" })
export class SystemConfig {
  @Column("text", { primary: true, name: "key" })
  key: string;

  @Column("text", { name: "value" })
  value: string;
}
