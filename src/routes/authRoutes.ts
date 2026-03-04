import { Router } from "express";
import { AuthController } from "../controllers/AuthController";
import { apiKeyMiddleware } from "../middleware/api-key-middleware";
import { requireRole } from "../middleware/role-middleware";

const router = Router();
const authController = new AuthController();

// Apply API Key Middleware to all auth routes
router.use(apiKeyMiddleware);

/**
 * @openapi
 * /auth/request-otp:
 *   post:
 *     tags: [Auth]
 *     summary: Request an OTP
 *     description: Sends a one-time password to the given phone number via SMS/WhatsApp.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/RequestOtpBody'
 *     responses:
 *       200:
 *         description: OTP sent
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: OTP sent successfully
 *       400:
 *         description: Missing phone number
 *       500:
 *         description: Server error
 */
router.post("/request-otp", authController.requestOTP);

/**
 * @openapi
 * /auth/verify-otp:
 *   post:
 *     tags: [Auth]
 *     summary: Verify an OTP
 *     description: Verifies the OTP code and returns user data with roles.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/VerifyOtpBody'
 *     responses:
 *       200:
 *         description: OTP verified, returns user data
 *       401:
 *         description: Invalid or expired OTP
 *       500:
 *         description: Server error
 */
router.post("/verify-otp", authController.verifyOTP);

/**
 * @openapi
 * /auth/sync:
 *   post:
 *     tags: [Auth]
 *     summary: Sync Supabase user
 *     description: Syncs a Supabase-authenticated user to the local database.
 *     responses:
 *       200:
 *         description: User synced
 *       401:
 *         description: Not authenticated
 *       500:
 *         description: Server error
 */
router.post("/sync", authController.syncUser);
router.get("/me", requireRole(["admin", "buyer", "driver", "merchant"]), authController.getMe);

export default router;
