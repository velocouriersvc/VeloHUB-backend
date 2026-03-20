import { Router } from "express";
import { AuditLogController } from "../controllers/AuditLogController";
import { apiKeyMiddleware } from "../middleware/api-key-middleware";
import { requireRole } from "../middleware/role-middleware";

const router = Router();
const auditLogController = new AuditLogController();

// Audit logs require admin role
router.use(apiKeyMiddleware);
const adminRole = requireRole(["admin"]);

/**
 * @openapi
 * /admin/audit-logs:
 *   get:
 *     tags: [Admin - Audit Logs]
 *     summary: List audit logs
 *     security:
 *       - ApiKeyAuth: []
 *     responses:
 *       200:
 *         description: List of audit logs
 */
router.get("/", adminRole, auditLogController.list);

export default router;
