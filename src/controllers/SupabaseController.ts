import { Request, Response } from "express";
import { supabaseAdmin } from "../utils/supabase-client";
import { AuditLogController } from "./AuditLogController";
import { AuditRiskLevel } from "../models/audit-log";

export class SupabaseController {
    /**
     * GET /api/v1/admin/supabase/tables
     * Lists available tables (Hardcoded for now as Supabase JS client doesn't 
     * natively list tables without a specific RPC).
     */
    listTables = async (req: Request, res: Response) => {
        try {
            // In a real scenario, you'd have an RPC like 'get_tables' in Supabase.
            // For now, we'll return a list of common tables we might find.
            const tables = [
                "profiles",
                "orders",
                "merchants",
                "drivers",
                "users",
                "notifications",
                "rides",
                "wallets",
                "transactions"
            ];
            
            return res.json({ tables });
        } catch (error: any) {
            console.error("Error listing Supabase tables:", error);
            return res.status(500).json({ message: "Internal server error", error: error.message });
        }
    };

    /**
     * GET /api/v1/admin/supabase/tables/:tableName
     * Fetches data from a specific Supabase table.
     */
    getTableData = async (req: Request, res: Response) => {
        try {
            const { tableName } = req.params;
            const { page = 1, limit = 50 } = req.query;
            
            const start = (Number(page) - 1) * Number(limit);
            const end = start + Number(limit) - 1;

            // Initial query
            let query = supabaseAdmin
                .from(tableName)
                .select("*", { count: "exact" })
                .range(start, end);

            // Attempt to sort by created_at
            let { data, error, count } = await query.order("created_at", { ascending: false });

            // If it fails because of missing created_at, try sorting by id or just fetch without order
            if (error && (error.message.includes('column "created_at" does not exist') || error.code === 'PGRST100')) {
                console.log(`Table ${tableName} missing 'created_at' column. Retrying with 'id' or no order.`);
                
                // Reset query
                const idQuery = supabaseAdmin
                    .from(tableName)
                    .select("*", { count: "exact" })
                    .range(start, end);
                
                const idResult = await idQuery.order("id", { ascending: false });
                
                if (idResult.error) {
                    // Final fallback: no order
                    const finalResult = await supabaseAdmin
                        .from(tableName)
                        .select("*", { count: "exact" })
                        .range(start, end);
                    
                    data = finalResult.data;
                    error = finalResult.error;
                    count = finalResult.count;
                } else {
                    data = idResult.data;
                    error = idResult.error;
                    count = idResult.count;
                }
            }

            if (error) {
                console.error(`Supabase error fetching ${tableName}:`, error);
                return res.status(400).json({ 
                    message: `Error fetching from ${tableName}`, 
                    error: error.message,
                    details: error 
                });
            }

            // Record audit log
            await AuditLogController.record({
                action: "View Supabase Table",
                entity_type: "supabase_table",
                entity_id: tableName,
                performed_by: (req as any).user?.email || (req as any).user?.phoneNumber || "Admin",
                details: `Viewed ${data?.length ?? 0} records from Supabase table: ${tableName}`,
                risk_level: AuditRiskLevel.LOW
            });

            return res.json({
                data,
                total: count,
                page: Number(page),
                limit: Number(limit)
            });
        } catch (error: any) {
            console.error("Error fetching table data:", error);
            return res.status(500).json({ message: "Internal server error", error: error.message });
        }
    };
}
