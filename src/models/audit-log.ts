import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from "typeorm";

export enum AuditRiskLevel {
    LOW = "low",
    MEDIUM = "medium",
    HIGH = "high",
}

@Entity("audit_logs")
export class AuditLog {
    @PrimaryGeneratedColumn("uuid")
    id: string;

    @Column({ type: "varchar", length: 255 })
    action: string;

    @Column({ type: "varchar", length: 100, nullable: true })
    entity_type: string;

    @Column({ type: "varchar", length: 255, nullable: true })
    entity_id: string;

    @Column({ type: "varchar", length: 255, nullable: true })
    performed_by: string;

    @Column({ type: "text", nullable: true })
    details: string;

    @Column({
        type: "enum",
        enum: AuditRiskLevel,
        default: AuditRiskLevel.LOW,
    })
    risk_level: AuditRiskLevel;

    @Column({ type: "varchar", length: 45, nullable: true })
    ip_address: string;

    @CreateDateColumn()
    created_date: Date;
}
