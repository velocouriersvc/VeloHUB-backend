import { Router } from "express";
import { apiKeyMiddleware } from "../middleware/api-key-middleware";
import { requireRole } from "../middleware/role-middleware";
import { CheckoutController } from "../controllers/CheckoutController";

const router = Router();
const checkoutController = new CheckoutController();

router.use(apiKeyMiddleware);

router.post("/", requireRole(["buyer"]), checkoutController.checkout);

export default router;

