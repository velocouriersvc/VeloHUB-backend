import { Router } from "express";
import { AuthController } from "../controllers/AuthController";
import { IdentityController } from "../controllers/IdentityController";
import { apiKeyMiddleware } from "../middleware/api-key-middleware";
import { requireAuth, requireRole } from "../middleware/role-middleware";
import { AppDataSource } from "../db/data-source";
import { PlatformSettings } from "../models/platform-settings";

const router = Router();
const authController = new AuthController();
const identityController = new IdentityController();

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

// Email + password auth (new KYC registration + login)
router.post("/register", authController.register);
router.post("/login", authController.login);
// Set or change password for the signed-in user (lets OTP users add a password)
router.post("/password", requireAuth, authController.setPassword);
// Forgot-password flow: email a reset code, then reset with the code (no auth)
router.post("/forgot-password", authController.forgotPassword);
router.post("/reset-password", authController.resetPassword);
// Phone (SMS) reset: request-otp first, then submit phone + code + new password.
router.post("/reset-password-phone", authController.resetPasswordByPhone);

/**
 * @openapi
 * /auth/apple-signin:
 *   post:
 *     tags: [Auth]
 *     summary: Sign in with Apple
 *     description: |
 *       Verifies an Apple identity token and returns the user's profile and roles.
 *       Creates a new account if the Apple subject ID is not yet registered.
 *       On first sign-in, Apple provides the user's name and email; subsequent logins only send the identity token.
 *     security:
 *       - ApiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [identityToken]
 *             properties:
 *               identityToken:
 *                 type: string
 *                 description: JWT identity token from Apple Sign-In
 *               fullName:
 *                 type: string
 *                 description: User's full name (only present on first sign-in)
 *               email:
 *                 type: string
 *                 description: User's email (only present on first sign-in)
 *     responses:
 *       200:
 *         description: Sign-in successful
 *       400:
 *         description: Missing identity token
 *       401:
 *         description: Invalid or expired Apple identity token
 *       500:
 *         description: Server error
 */
router.post("/apple-signin", authController.appleSignIn);

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
router.get("/me", requireAuth, authController.getMe);

/**
 * @openapi
 * /auth/identity-session:
 *   post:
 *     tags: [Auth]
 *     summary: Create Stripe Identity verification session
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
 *               id: "vs_XXXXX"
 *               clientSecret: "vsc_XXXXX"
 *               ephemeralKeySecret: "vsek_XXXXX"
 *       403:
 *         description: Unauthorized
 */
router.post("/identity-session", requireRole(["driver", "merchant", "buyer"]), identityController.createSession);

/**
 * GET /auth/platform-config/:country
 * Public endpoint - returns service availability flags for the given country.
 */
router.get("/platform-config/:country", async (req, res) => {
    try {
        const country = req.params.country.toUpperCase();
        const repo = AppDataSource.getRepository(PlatformSettings);
        const settings = await repo.findOne({ where: { country } });

        if (!settings) {
            return res.status(200).json({
                country,
                ridesEnabled: false,
                deliveryEnabled: false,
                isActive: false,
                currency: "USD",
            });
        }

        return res.status(200).json({
            country: settings.country,
            currency: settings.currency,
            ridesEnabled: settings.ridesEnabled ?? true,
            deliveryEnabled: settings.deliveryEnabled ?? true,
            isActive: settings.isActive,
        });
    } catch {
        return res.status(500).json({ message: "Failed to fetch platform config" });
    }
});

export default router;
