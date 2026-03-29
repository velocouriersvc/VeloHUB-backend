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
 *     description: |
 *       Sends a one-time password to the given phone number. 
 *       Powered by **Prelude**, this uses multi-channel routing (WhatsApp/SMS) to ensure delivery. 
 *       This is the first step of the authentication flow.
 *     security:
 *       - ApiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/RequestOtpBody'
 *           example:
 *             phoneNumber: "+233501234567"
 *     responses:
 *       200:
 *         description: OTP request successful (Prelude has triggered verification)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: OTP request successful
 *       400:
 *         description: Missing or invalid phone number
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       403:
 *         description: Invalid API key
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
 *     description: |
 *       Verifies the OTP code via **Prelude** and returns user data with roles.
 *       Use the phone number and the code received on your device.
 *     security:
 *       - ApiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/VerifyOtpBody'
 *           example:
 *             phoneNumber: "+233501234567"
 *             code: "123456"
 *     responses:
 *       200:
 *         description: OTP verified successfully by Prelude
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: OTP verified
 *                 user:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       format: uuid
 *                     phoneNumber:
 *                       type: string
 *                     roles:
 *                       type: array
 *                       items:
 *                         type: string
 *                       example: ["buyer"]
 *       401:
 *         description: Invalid or expired OTP (Prelude verification failed)
 *       403:
 *         description: Invalid API key
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
 *     description: Syncs a Supabase-authenticated user to the local database (migration helper).
 *     security:
 *       - ApiKeyAuth: []
 *     responses:
 *       200:
 *         description: User synced
 *       401:
 *         description: Not authenticated
 *       500:
 *         description: Server error
 */
router.post("/sync", authController.syncUser);

/**
 * @openapi
 * /auth/me:
 *   get:
 *     tags: [Auth]
 *     summary: Get current user
 *     description: Returns the authenticated user's profile, roles, and approval status.
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/PhoneNumber'
 *     responses:
 *       200:
 *         description: Current user data with roles
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 user:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       format: uuid
 *                     phoneNumber:
 *                       type: string
 *                     roles:
 *                       type: array
 *                       items:
 *                         type: string
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Invalid API key or role not approved
 */
router.get("/me", requireRole(["admin", "buyer", "driver", "merchant"]), authController.getMe);

export default router;
