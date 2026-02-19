import { Router } from "express";
import { AuthController } from "../controllers/AuthController";
import { authenticateUser } from "../middleware/auth-middleware";

const router = Router();
const authController = new AuthController();

router.post("/request-otp", authController.requestOTP);
router.post("/verify-otp", authController.verifyOTP);
router.post("/sync", authenticateUser, authController.syncUser);
router.get("/config", authController.getConfig);
router.get("/search", authController.searchUser);

export default router;
