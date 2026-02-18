import { Router } from "express";
import { AuthController } from "../controllers/AuthController.js";

const router = Router();
const authController = new AuthController();

router.post("/request-otp", authController.requestOTP);
router.post("/verify-otp", authController.verifyOTP);

export default router;
