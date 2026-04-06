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
 *     description: Creates or updates a buyer profile for the authenticated user. Requires **buyer** role.
 *     security:
 *       - ApiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/BuyerSetupBody'
 *           example:
 *             phone: "+233501234567"
 *             full_name: "Kwame Asante"
 *             email: "kwame@example.com"
 *             location: "Greater Accra"
 *             country_code: "GH"
 *             ghana_card_number: "GHA-123456789-0"
 *             role: "customer"
 *             privacy_consent: true
 *     responses:
 *       200:
 *         description: Buyer profile created/updated
 *       401:
 *         description: User ID required or not authenticated
 *       403:
 *         description: Invalid API key or role not approved
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
 *     description: |
 *       Creates or updates a driver profile with vehicle info. Requires **driver** role.
 *       Upload ID and license photos first via `POST /uploads`, then pass the URLs here.
 *     security:
 *       - ApiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/DriverSetupBody'
 *           example:
 *             phone: "+233501234567"
 *             full_name: "Isaac Menuve"
 *             email: "isaac@example.com"
 *             location: "Greater Accra"
 *             country_code: "GH"
 *             vehicle_type: "Motorcycle"
 *             vehicle_number: "GR 1234-22"
 *             vehicle_model: "Yamaha"
 *             vehicle_color: "Blue"
 *             license_number: "D-1234567"
 *             ghana_card_number: "GHA-123456789-0"
 *             ghana_card_front_url: "file:///path/to/front.jpg"
 *             ghana_card_back_url: "file:///path/to/back.jpg"
 *             role: "driver"
 *             privacy_consent: true
 *     responses:
 *       200:
 *         description: Driver profile created/updated
 *       401:
 *         description: User ID required or not authenticated
 *       403:
 *         description: Invalid API key or role not approved
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
 *     description: |
 *       Creates or updates a merchant profile with business info. Requires **merchant** role.
 *       Upload ID and registration docs first via `POST /uploads`, then pass the URLs here.
 *     security:
 *       - ApiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/MerchantSetupBody'
 *           example:
 *             phone: "+233541234567"
 *             business_name: "Tasty Treats"
 *             business_type: "Restaurant"
 *             business_address: "123 Main St, Accra"
 *             location: "Greater Accra"
 *             country_code: "GH"
 *             ghana_card_number: "GHA-123456789-0"
 *             ghana_card_front_url: "https://minio-service:9000/velo-uploads/id-cards/abc/123.jpg"
 *             ghana_card_back_url: "https://minio-service:9000/velo-uploads/id-cards/abc/456.jpg"
 *             role: "merchant"
 *             privacy_consent: true
 *     responses:
 *       200:
 *         description: Merchant profile created/updated
 *       401:
 *         description: User ID required or not authenticated
 *       403:
 *         description: Invalid API key or role not approved
 *       500:
 *         description: Server error
 */
router.post("/merchant", requireRole(["merchant"]), profileController.setupMerchant);

export default router;
