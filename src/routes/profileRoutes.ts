import { Router } from "express";
import { ProfileController } from "../controllers/ProfileController";
import { apiKeyMiddleware } from "../middleware/api-key-middleware";
import { requireRole } from "../middleware/role-middleware";

const router = Router();
const profileController = new ProfileController();

// Apply API Key Middleware to all profile routes
router.use(apiKeyMiddleware);

/**
 * @openapi
 * /profile/buyer:
 *   post:
 *     tags: [Profile]
 *     summary: Setup buyer profile
 *     description: Creates or updates a buyer profile for the authenticated user.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/BuyerSetupBody'
 *     responses:
 *       200:
 *         description: Buyer profile created/updated
 *       401:
 *         description: User ID required
 *       500:
 *         description: Server error
 */
router.post("/buyer", requireRole(["buyer"]), profileController.setupBuyer);

/**
 * @openapi
 * /profile/driver:
 *   post:
 *     tags: [Profile]
 *     summary: Setup driver profile
 *     description: Creates or updates a driver profile with vehicle info.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/DriverSetupBody'
 *     responses:
 *       200:
 *         description: Driver profile created/updated
 *       401:
 *         description: User ID required
 *       500:
 *         description: Server error
 */
router.post("/driver", requireRole(["driver"]), profileController.setupDriver);

/**
 * @openapi
 * /profile/merchant:
 *   post:
 *     tags: [Profile]
 *     summary: Setup merchant profile
 *     description: Creates or updates a merchant profile with business info.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/MerchantSetupBody'
 *     responses:
 *       200:
 *         description: Merchant profile created/updated
 *       401:
 *         description: User ID required
 *       500:
 *         description: Server error
 */
router.post("/merchant", requireRole(["merchant"]), profileController.setupMerchant);

export default router;
