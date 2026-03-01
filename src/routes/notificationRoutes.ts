import { Router } from "express";
import { NotificationController } from "../controllers/NotificationController";
import { apiKeyMiddleware } from "../middleware/api-key-middleware";
import { requireRole } from "../middleware/role-middleware";

const router = Router();
const notificationController = new NotificationController();

// Apply API Key Middleware
router.use(apiKeyMiddleware);

// All roles can access notifications
const anyRole = requireRole(["buyer", "driver", "merchant"]);

router.get("/", anyRole, notificationController.getNotifications);
router.put("/:id/read", anyRole, notificationController.markAsRead);
router.put("/read-all", anyRole, notificationController.markAllAsRead);
router.post("/push-token", anyRole, notificationController.registerPushToken);
router.delete("/push-token", anyRole, notificationController.removePushToken);

export default router;
