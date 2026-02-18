import { Router } from "express";
import { ProfileController } from "../controllers/ProfileController.js";

const router = Router();
const profileController = new ProfileController();

router.post("/buyer", profileController.createBuyerProfile);
router.post("/driver", profileController.createDriverProfile);
router.post("/merchant", profileController.createMerchantProfile);

export default router;
