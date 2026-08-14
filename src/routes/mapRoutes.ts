import { Router } from "express";
import { MapController } from "../controllers/MapController";
import { apiKeyMiddleware } from "../middleware/api-key-middleware";

const router = Router();
const mapController = new MapController();

// Public (api-key only, no role) - the customer web coverage map reads this without a user session.
router.use(apiKeyMiddleware);

/**
 * @openapi
 * /map/live:
 *   get:
 *     tags: [Map]
 *     summary: Anonymized active-driver points for the public coverage map
 *     security:
 *       - ApiKeyAuth: []
 *     responses:
 *       200:
 *         description: "{ drivers: [{ lat, lng }] } - coarsened, no identity"
 */
router.get("/live", mapController.getLive);

/**
 * @openapi
 * /map/users:
 *   get:
 *     tags: [Map]
 *     summary: Signed-up user counts per country for the public coverage map
 *     security:
 *       - ApiKeyAuth: []
 *     responses:
 *       200:
 *         description: "{ users: [{ country, count }] } - aggregate only, no identities or coordinates"
 */
router.get("/users", mapController.getUsers);

export default router;
