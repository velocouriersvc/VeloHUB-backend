import { Router } from "express";
import { ProfileController } from "../controllers/ProfileController";
import { authenticateUser } from "../middleware/auth-middleware";

const router = Router();
const profileController = new ProfileController();

// Profile routes (spec says /api/v1/profile/...)
router.post("/buyer", authenticateUser, profileController.setupBuyer);
router.post("/driver", authenticateUser, profileController.setupDriver);
router.post("/merchant", authenticateUser, profileController.setupMerchant);

export default router;
