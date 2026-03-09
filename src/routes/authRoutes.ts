import { Router } from "express";
import { AuthController } from "../controllers/AuthController";
import { apiKeyMiddleware } from "../middleware/api-key-middleware";
import { requireRole } from "../middleware/role-middleware";

const router = Router();
const authController = new AuthController();

// Apply API Key Middleware to all auth routes
router.use(apiKeyMiddleware);

router.post("/request-otp", authController.requestOTP);
router.post("/verify-otp", authController.verifyOTP);
router.post("/sync", authController.syncUser);
router.get("/me", requireRole(["admin", "buyer", "driver", "merchant"]), authController.getMe);

export default router;
