import { Router } from "express";
import { IdentityController } from "../controllers/IdentityController";
import { apiKeyMiddleware } from "../middleware/api-key-middleware";
import { requireRole } from "../middleware/role-middleware";

const router = Router();
const identityController = new IdentityController();

/**
 * @openapi
 * /identity/webhook:
 *   post:
 *     tags: [Identity]
 *     summary: Stripe Identity webhook
 *     description: |
 *       Called by Stripe when an identity verification session status changes.
 *       Verified by `stripe-signature` header.
 *     security: []
 *     responses:
 *       200:
 *         description: Webhook acknowledged
 */
router.post("/webhook", identityController.handleWebhook);

// Protected routes (requires API key at least)
router.use(apiKeyMiddleware);

/**
 * @openapi
 * /auth/identity-session:
 *   post:
 *     tags: [Identity]
 *     summary: Create verification session
 *     description: Creates a Stripe Identity Verification session and returns the client secret and ephemeral key for the mobile SDK.
 *     security:
 *       - ApiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               phoneNumber:
 *                 type: string
 *                 example: "+233501234567"
 *     responses:
 *       201:
 *         description: Session created
 *         content:
 *           application/json:
 *             example:
 *               sessionId: "vs_XXXXX"
 *               clientSecret: "vsc_XXXXX"
 *               ephemeralKeySecret: "vsek_XXXXX"
 *       403:
 *         description: Unauthorized
 */
// Typically drivers and merchants need this.
router.post("/identity-session", requireRole(["driver", "merchant", "buyer"]), identityController.createSession);

export default router;
