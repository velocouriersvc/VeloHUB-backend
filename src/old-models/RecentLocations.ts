import { Column, Entity, Index } from "typeorm";

@Index("recent_locations_pkey", ["id"], { unique: true })
@Entity("recent_locations", { schema: "public" })
export class RecentLocations {
  @Column("uuid", {
    primary: true,
    name: "id",
    default: () => "gen_random_uuid()",
  })
  id: string;

  @Column("uuid", { name: "user_id", nullable: true })
  userId: string | null;

  @Column("numeric", { name: "latitude", precision: 10, scale: 8 })
  latitude: string;

  @Column("numeric", { name: "longitude", precision: 11, scale: 8 })
  longitude: string;

  @Column("text", { name: "address", nullable: true })
  address: string | null;

  @Column("timestamp with time zone", {
    name: "created_at",
    nullable: true,
    default: () => "now()",
  })
  createdAt: Date | null;
}
