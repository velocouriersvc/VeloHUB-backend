import { Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { Profiles } from "./Profiles";

@Index("idx_api_errors_created", ["createdAt"], {})
@Index("api_errors_pkey", ["id"], { unique: true })
@Index("idx_api_errors_resolved", ["resolved"], {})
@Index("idx_api_errors_service", ["serviceName"], {})
@Index("idx_api_errors_user", ["userId"], {})
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

  @Column("integer", { name: "response_status", nullable: true })
  responseStatus: number | null;

  @Column("text", { name: "error_message" })
  errorMessage: string;

  @Column("text", { name: "error_code", nullable: true })
  errorCode: string | null;

  @Column("text", { name: "stack_trace", nullable: true })
  stackTrace: string | null;

  @Column("uuid", { name: "user_id", nullable: true })
  userId: string | null;

  @Column("integer", {
    name: "retry_count",
    nullable: true,
    default: () => "0",
  })
  retryCount: number | null;

  @Column("boolean", {
    name: "resolved",
    nullable: true,
    default: () => "false",
  })
  resolved: boolean | null;

  @Column("timestamp with time zone", { name: "resolved_at", nullable: true })
  resolvedAt: Date | null;

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

  @ManyToOne(() => Profiles, (profiles) => profiles.apiErrors, {
    onDelete: "SET NULL",
  })
  @JoinColumn([{ name: "user_id", referencedColumnName: "id" }])
  user: Profiles;
}
