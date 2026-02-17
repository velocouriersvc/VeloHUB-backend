import { Column, Entity, Index } from "typeorm";

@Index("api_errors_pkey", ["id"], { unique: true })
@Entity("api_errors", { schema: "public" })
export class ApiErrors {
  @Column("uuid", {
    primary: true,
    name: "id",
    default: () => "gen_random_uuid()",
  })
  id: string;

  @Column("text", { name: "service_name" })
  serviceName: string;

  @Column("text", { name: "endpoint" })
  endpoint: string;

  @Column("text", { name: "method" })
  method: string;

  @Column("jsonb", { name: "request_payload", nullable: true })
  requestPayload: object | null;

  @Column("text", { name: "error_message" })
  errorMessage: string;

  @Column("integer", {
    name: "retry_count",
    nullable: true,
    default: () => "0",
  })
  retryCount: number | null;

  @Column("uuid", { name: "user_id", nullable: true })
  userId: string | null;

  @Column("timestamp with time zone", {
    name: "created_at",
    nullable: true,
    default: () => "now()",
  })
  createdAt: Date | null;
}
