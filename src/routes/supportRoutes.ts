import { Router } from "express";
import { AdminController } from "../controllers/AdminController";
import { apiKeyMiddleware } from "../middleware/api-key-middleware";
import { requireAuth } from "../middleware/role-middleware";

const router = Router();
const adminController = new AdminController();

router.use(apiKeyMiddleware);
// Public website contact form (anonymous): emails support + confirmation.
router.post("/contact", adminController.contactForm);
router.post("/", requireAuth, adminController.createSupportTicket);

export default router;
