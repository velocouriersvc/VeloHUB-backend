import { Router } from "express";
import { ProfileController } from "../controllers/ProfileController";
import { apiKeyMiddleware } from "../middleware/api-key-middleware";
import { requireRole } from "../middleware/role-middleware";

const router = Router();
const profileController = new ProfileController();

// Apply API Key Middleware to all profile routes
router.use(apiKeyMiddleware);

// Profile routes with role checking
router.post("/buyer", requireRole(["buyer"]), profileController.setupBuyer);
router.post("/driver", requireRole(["driver"]), profileController.setupDriver);
router.post("/merchant", requireRole(["merchant"]), profileController.setupMerchant);

export default router;
