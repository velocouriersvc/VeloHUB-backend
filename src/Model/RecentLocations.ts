import { Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { Profiles } from "./Profiles";

@Index("idx_recent_locations_created_at", ["createdAt"], {})
@Index("recent_locations_pkey", ["id"], { unique: true })
@Index("idx_recent_locations_user_id", ["userId"], {})
@Entity("recent_locations", { schema: "public" })
export class RecentLocations {
  @Column("uuid", {
    primary: true,
    name: "id",
    default: () => "gen_random_uuid()",
  })
  id: string;

  @Column("uuid", { name: "user_id" })
  userId: string;

  @Column("text", { name: "name" })
  name: string;

  @Column("text", { name: "address" })
  address: string;

  @Column("numeric", { name: "latitude" })
  latitude: string;

  @Column("numeric", { name: "longitude" })
  longitude: string;

  @Column("text", { name: "type", nullable: true })
  type: string | null;

  @Column("timestamp with time zone", {
    name: "created_at",
    nullable: true,
    default: () => "now()",
  })
  createdAt: Date | null;

  @ManyToOne(() => Profiles, (profiles) => profiles.recentLocations, {
    onDelete: "CASCADE",
  })
  @JoinColumn([{ name: "user_id", referencedColumnName: "id" }])
  user: Profiles;
}
