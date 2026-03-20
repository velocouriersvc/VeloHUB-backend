import { Request, Response } from "express";
import { AppDataSource } from "../db/data-source";
import { AuditLog, AuditRiskLevel } from "../models/audit-log";
import { createServiceLogger } from "../utils/logger";

const log = createServiceLogger("AuditLogController");

export class AuditLogController {
    private auditLogRepo = AppDataSource.getRepository(AuditLog);

    /**
     * GET /admin/audit-logs
     */
    list = async (req: Request, res: Response) => {
        try {
            const { limit = 100, sort = "-created_date" } = req.query;
            
            const orderField = (sort as string).startsWith('-') ? (sort as string).substring(1) : (sort as string);
            const orderDir = (sort as string).startsWith('-') ? "DESC" : "ASC";

            const logs = await this.auditLogRepo.find({
                order: { [orderField]: orderDir },
                take: Number(limit)
            });

            return res.json(logs);
        } catch (error) {
            log.error("Error fetching audit logs", { error: (error as Error).message });
            return res.status(500).json({ message: "Internal server error" });
        }
    };

    /**
     * Static helper to create a log entry from anywhere in the backend
     */
    static async record(data: {
        action: string;
        entity_type?: string;
        entity_id?: string;
        performed_by?: string;
        details?: string;
        risk_level?: AuditRiskLevel;
        ip_address?: string;
    }) {
        try {
            const auditLogRepo = AppDataSource.getRepository(AuditLog);
            const logEntry = auditLogRepo.create(data);
            await auditLogRepo.save(logEntry);
        } catch (error) {
            console.error("Failed to record audit log:", error);
        }
    }
}
