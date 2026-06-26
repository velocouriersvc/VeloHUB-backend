import { Router } from "express";
import { SupabaseController } from "../controllers/SupabaseController";
import { requireAuth, requireRole } from "../middleware/role-middleware";
import { apiKeyMiddleware } from "../middleware/api-key-middleware";

const router = Router();
const supabaseController = new SupabaseController();

// All supabase management routes require API Key and Admin role
router.use(apiKeyMiddleware);
router.use(requireAuth);
router.use(requireRole(["admin"]));

/**
 * @openapi
 * /admin/supabase/migrate/stream:
 *   get:
 *     tags: [Admin, Supabase]
 *     summary: Stream the full data migration progress
 *     security:
 *       - ApiKeyAuth: []
 */
router.get("/migrate/stream", supabaseController.streamMigration);
router.get("/config", supabaseController.getSupabaseConfig);
router.get("/stats", supabaseController.getSupabaseStats);

/**
 * @openapi
 * /admin/supabase/tables:
 *   get:
 *     tags: [Admin, Supabase]
 *     summary: List available Supabase tables
 *     security:
 *       - ApiKeyAuth: []
 */
router.get("/tables", supabaseController.listTables);

/**
 * @openapi
 * /admin/supabase/tables/{tableName}:
 *   get:
 *     tags: [Admin, Supabase]
 *     summary: Get data from a Supabase table
 *     parameters:
 *       - in: path
 *         name: tableName
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 */
router.get("/tables/:tableName", supabaseController.getTableData);

export default router;
