
import { Router } from "express";
import { DevController } from "../controllers/DevController";
import { apiKeyMiddleware } from "../middleware/api-key-middleware";

const router = Router();
const devController = new DevController();

// Apply API Key Middleware? 
// Yes, let's keep it consistent. User can enter it in the UI.
router.use(apiKeyMiddleware);

/**
 * @openapi
 * /dev/db-data:
 *   get:
 *     tags: [Dev]
 *     summary: Get all database data (development only)
 *     description: Returns all users, profiles, roles, and OTPs. For debugging.
 *     responses:
 *       200:
 *         description: All database tables
 *       500:
 *         description: Server error
 */
router.get("/db-data", devController.getAllData);

export default router;
