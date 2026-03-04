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
 *             phoneNumber: "+233501234567"
 *             fullName: "Kwame Asante"
 *             email: "kwame@example.com"
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
 *             phoneNumber: "+233501234567"
 *             fullName: "Kofi Mensah"
 *             vehicleType: "motorbike"
 *             licensePlate: "GR-1234-21"
 *             email: "kofi@example.com"
 *             idImageUrl: "http://minio-service:9000/velo-uploads/id-cards/abc123/photo.jpg"
 *             licensePhotoUrl: "http://minio-service:9000/velo-uploads/licenses/abc123/license.jpg"
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
 *             phoneNumber: "+233501234567"
 *             businessName: "Accra Express Deliveries"
 *             businessAddress: "15 Independence Ave, Accra"
 *             email: "info@accraexpress.com"
 *             registrationDocUrl: "http://minio-service:9000/velo-uploads/registration/abc123/doc.pdf"
 *             idImageUrl: "http://minio-service:9000/velo-uploads/id-cards/abc123/id.jpg"
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
