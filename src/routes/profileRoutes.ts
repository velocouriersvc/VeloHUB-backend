import { Router } from "express";
import { ProfileController } from "../controllers/ProfileController";
import { apiKeyMiddleware } from "../middleware/api-key-middleware";

const router = Router();
const profileController = new ProfileController();

// Apply API Key Middleware to all profile routes
router.use(apiKeyMiddleware);

// Profile routes (spec says /api/v1/profile/...)
// authenticateUser removed as requested for API-key only flow
router.post("/buyer", profileController.setupBuyer);
router.post("/driver", profileController.setupDriver);
router.post("/merchant", profileController.setupMerchant);

export default router;
