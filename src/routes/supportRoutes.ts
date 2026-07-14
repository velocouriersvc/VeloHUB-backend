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
// The user's own tickets (status + resolution visible in-app).
router.get("/", requireAuth, adminController.getMySupportTickets);
// Conversation thread on a ticket: user and support reply until it is closed.
router.get("/:id/messages", requireAuth, adminController.getMyTicketMessages);
router.post("/:id/messages", requireAuth, adminController.postMyTicketMessage);

export default router;
