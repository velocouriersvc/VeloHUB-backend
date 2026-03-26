import { Router } from "express";
import { SubscriptionController } from "../controllers/SubscriptionController";
import { apiKeyMiddleware } from "../middleware/api-key-middleware";
import { requireRole } from "../middleware/role-middleware";

const router = Router();
const controller = new SubscriptionController();

// Apply API Key Middleware to all subscription routes
router.use(apiKeyMiddleware);

/**
 * @openapi
 * /services/subscriptions/access:
 *   get:
 *     tags: [Subscriptions]
 *     summary: Check service access
 *     description: Checks if the current buyer has an active service subscription. Requires **buyer** role.
 *     responses:
 *       200:
 *         description: Access status
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 hasAccess: { type: "boolean", example: true }
 *       401:
 *         description: Unauthorized
 */
router.get("/access", requireRole(["buyer"]), (req, res) => controller.checkAccess(req, res));

/**
 * @openapi
 * /services/subscriptions/status:
 *   get:
 *     tags: [Subscriptions]
 *     summary: Get subscription status
 *     description: Retrieves the current subscription status and period for the authenticated buyer.
 *     responses:
 *       200:
 *         description: Subscription status
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SubscriptionStatusResponse'
 *       401:
 *         description: Unauthorized
 */
router.get("/status", requireRole(["buyer"]), (req, res) => controller.getStatus(req, res));

/**
 * @openapi
 * /services/subscriptions/subscribe:
 *   post:
 *     tags: [Subscriptions]
 *     summary: Initiate service subscription
 *     description: Starts a new subscription payment process (100 GHS/month). Requires **buyer** role.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/InitiateSubscriptionBody'
 *     responses:
 *       201:
 *         description: Subscription initiated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 subscriptionId: { type: "string", format: "uuid" }
 *                 reference: { type: "string" }
 *                 authorizationUrl: { type: "string", format: "uri" }
 *       400:
 *         description: Invalid input or user not found
 *       401:
 *         description: Unauthorized
 */
router.post("/subscribe", requireRole(["buyer"]), (req, res) => controller.initiateSubscription(req, res));

export default router;
