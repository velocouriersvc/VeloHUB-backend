import { Router } from "express";
import { AuthController } from "../controllers/AuthController";
import { apiKeyMiddleware } from "../middleware/api-key-middleware";

const router = Router();
const authController = new AuthController();

// Apply API Key Middleware to all auth routes
router.use(apiKeyMiddleware);

router.post("/request-otp", authController.requestOTP);
router.post("/verify-otp", authController.verifyOTP);
router.post("/sync", authController.syncUser);

export default router;
