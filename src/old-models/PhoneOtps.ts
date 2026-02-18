import { Column, Entity, Index } from "typeorm";

@Index("phone_otps_pkey", ["id"], { unique: true })
@Index("phone_otps_phone_key", ["phone"], { unique: true })
@Entity("phone_otps", { schema: "public" })
export class PhoneOtps {
  @Column("uuid", {
    primary: true,
    name: "id",
    default: () => "gen_random_uuid()",
  })
  id: string;

  @Column("character varying", { name: "phone", unique: true })
  phone: string;

  @Column("character varying", { name: "code" })
  code: string;

  @Column("timestamp with time zone", {
    name: "created_at",
    default: () => "now()",
  })
  createdAt: Date;

  @Column("timestamp without time zone", { name: "expires_at" })
  expiresAt: Date;
}
