import { Router } from "express";
import { WaitlistController } from "../controllers/WaitlistController";
import { apiKeyMiddleware } from "../middleware/api-key-middleware";
import { requireRole } from "../middleware/role-middleware";

const router = Router();
const waitlistController = new WaitlistController();

// Public route to join waitlist
router.post("/join", apiKeyMiddleware, waitlistController.joinWaitlist);
router.get("/countries", apiKeyMiddleware, waitlistController.getCountries);

// Admin routes
router.get("/entries", apiKeyMiddleware, requireRole(["admin"]), waitlistController.getEntries);
router.delete("/entries/:id", apiKeyMiddleware, requireRole(["admin"]), waitlistController.deleteEntry);
router.post("/countries", apiKeyMiddleware, requireRole(["admin"]), waitlistController.addCountry);

export default router;
