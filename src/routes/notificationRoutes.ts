import { Router } from "express";
import { NotificationController } from "../controllers/NotificationController";
import { apiKeyMiddleware } from "../middleware/api-key-middleware";
import { requireRole, requireAuth } from "../middleware/role-middleware";

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
 *     description: Returns paginated list of in-app notifications. Requires **buyer**, **driver**, or **merchant** role.
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/PhoneNumber'
 *       - $ref: '#/components/parameters/Limit'
 *       - $ref: '#/components/parameters/Offset'
 *     responses:
 *       200:
 *         description: Paginated notification list
 *       403:
 *         description: Invalid API key or role not approved
 */
router.get("/", anyRole, notificationController.getNotifications);

/**
 * @openapi
 * /notifications/{id}/read:
 *   put:
 *     tags: [Notifications]
 *     summary: Mark a notification as read
 *     description: Marks a single notification as read. Requires **buyer**, **driver**, or **merchant** role.
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         description: Notification ID (UUID)
 *         schema:
 *           type: string
 *           format: uuid
 *         example: "550e8400-e29b-41d4-a716-446655440000"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/PhoneOnlyBody'
 *           example:
 *             phoneNumber: "+233501234567"
 *     responses:
 *       200:
 *         description: Notification marked as read
 *       403:
 *         description: Invalid API key or role not approved
 */
router.put("/:id/read", anyRole, notificationController.markAsRead);

/**
 * @openapi
 * /notifications/read-all:
 *   put:
 *     tags: [Notifications]
 *     summary: Mark all notifications as read
 *     description: Marks all of the user's notifications as read. Requires **buyer**, **driver**, or **merchant** role.
 *     security:
 *       - ApiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/PhoneOnlyBody'
 *           example:
 *             phoneNumber: "+233501234567"
 *     responses:
 *       200:
 *         description: All notifications marked as read
 *       403:
 *         description: Invalid API key or role not approved
 */
router.put("/read-all", anyRole, notificationController.markAllAsRead);

/**
 * @openapi
 * /notifications/push-token:
 *   post:
 *     tags: [Notifications]
 *     summary: Register a push notification token
 *     description: Register an Expo/FCM push token for receiving push notifications. Requires **buyer**, **driver**, or **merchant** role.
 *     security:
 *       - ApiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/PushTokenBody'
 *           example:
 *             phoneNumber: "+233501234567"
 *             token: "ExponentPushToken[xxxxxxxxxxxxxx]"
 *             platform: "android"
 *     responses:
 *       201:
 *         description: Token registered
 *       400:
 *         description: token and platform are required
 *       403:
 *         description: Invalid API key or role not approved
 *   delete:
 *     tags: [Notifications]
 *     summary: Remove push token (on logout)
 *     description: Remove a push token when user logs out. Requires **buyer**, **driver**, or **merchant** role.
 *     security:
 *       - ApiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/RemovePushTokenBody'
 *           example:
 *             phoneNumber: "+233501234567"
 *             token: "ExponentPushToken[xxxxxxxxxxxxxx]"
 *     responses:
 *       200:
 *         description: Token removed
 *       400:
 *         description: token is required
 *       403:
 *         description: Invalid API key or role not approved
 */
router.post("/push-token", requireAuth, notificationController.registerPushToken);
router.delete("/push-token", requireAuth, notificationController.removePushToken);

export default router;
