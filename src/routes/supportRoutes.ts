import { Router } from "express";
import { AdminController } from "../controllers/AdminController";
import { apiKeyMiddleware } from "../middleware/api-key-middleware";
import { requireAuth } from "../middleware/role-middleware";

const router = Router();
const adminController = new AdminController();

router.use(apiKeyMiddleware);
router.post("/", requireAuth, adminController.createSupportTicket);

export default router;
