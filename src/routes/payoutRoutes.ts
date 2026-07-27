import { Router } from "express";
import { PayoutController } from "../controllers/PayoutController";
import { apiKeyMiddleware } from "../middleware/api-key-middleware";
import { requireRole } from "../middleware/role-middleware";

const router = Router();
const controller = new PayoutController();

router.use(apiKeyMiddleware);

// Drivers and merchants both request payouts.
const payoutRoles = requireRole(["driver", "merchant"]);

router.get("/banks", payoutRoles, controller.listBanks);
router.get("/bank", payoutRoles, controller.getBank);
router.post("/bank", payoutRoles, controller.saveBank);
router.post("/quote", payoutRoles, controller.quote);
router.post("/otp", payoutRoles, controller.sendOtp);
router.post("/instant", payoutRoles, controller.instant);

export default router;
