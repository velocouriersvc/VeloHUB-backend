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

/**
 * @openapi
 * /notifications:
 *   get:
 *     tags: [Notifications]
 *     summary: Get user's notifications
 *     parameters:
 *       - $ref: '#/components/parameters/PhoneNumber'
 *       - $ref: '#/components/parameters/Limit'
 *       - $ref: '#/components/parameters/Offset'
 *     responses:
 *       200:
 *         description: Paginated notification list
 */
router.get("/", anyRole, notificationController.getNotifications);

/**
 * @openapi
 * /notifications/{id}/read:
 *   put:
 *     tags: [Notifications]
 *     summary: Mark a notification as read
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [phoneNumber]
 *             properties:
 *               phoneNumber:
 *                 type: string
 *     responses:
 *       200:
 *         description: Notification marked as read
 */
router.put("/:id/read", anyRole, notificationController.markAsRead);

/**
 * @openapi
 * /notifications/read-all:
 *   put:
 *     tags: [Notifications]
 *     summary: Mark all notifications as read
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [phoneNumber]
 *             properties:
 *               phoneNumber:
 *                 type: string
 *     responses:
 *       200:
 *         description: All notifications marked as read
 */
router.put("/read-all", anyRole, notificationController.markAllAsRead);

/**
 * @openapi
 * /notifications/push-token:
 *   post:
 *     tags: [Notifications]
 *     summary: Register a push notification token
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/PushTokenBody'
 *     responses:
 *       201:
 *         description: Token registered
 *       400:
 *         description: token and platform are required
 *   delete:
 *     tags: [Notifications]
 *     summary: Remove push token (on logout)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/RemovePushTokenBody'
 *     responses:
 *       200:
 *         description: Token removed
 *       400:
 *         description: token is required
 */
router.post("/push-token", anyRole, notificationController.registerPushToken);
router.delete("/push-token", anyRole, notificationController.removePushToken);

export default router;
