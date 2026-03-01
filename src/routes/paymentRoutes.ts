import { Router } from "express";
import { PaymentController } from "../controllers/PaymentController";
import { apiKeyMiddleware } from "../middleware/api-key-middleware";
import { requireRole } from "../middleware/role-middleware";

const router = Router();
const paymentController = new PaymentController();

// Webhook — NO api key or role check (Paystack calls this directly)
router.post("/webhook", paymentController.handleWebhook);

// Protected routes
router.use(apiKeyMiddleware);
router.post("/verify/:reference", requireRole(["buyer", "driver"]), paymentController.verifyPayment);
router.get("/history", requireRole(["buyer", "driver"]), paymentController.getPaymentHistory);

export default router;
