import { Response } from "express";
import { AuthRequest } from "../middleware/role-middleware";
import { NotificationService } from "../services/notification-service";
import { DevicePlatform } from "../models/push-token";
import { createServiceLogger } from "../utils/logger";

const log = createServiceLogger("NotificationController");

export class NotificationController {
    private notificationService = new NotificationService();

    /**
     * GET /notifications
     * Get user's notifications (for notification screen)
     */
    getNotifications = async (req: AuthRequest, res: Response) => {
        try {
            const userId = req.user?.id;
            if (!userId) return res.status(401).json({ message: "User ID required" });

            const limit = Number(req.query.limit) || 30;
            const offset = Number(req.query.offset) || 0;

            const result = await this.notificationService.getUserNotifications(userId, limit, offset);
            return res.json(result);
        } catch (error) {
            log.error("Error getting notifications", { error: (error as Error).message });
            return res.status(500).json({ message: "Internal server error" });
        }
    };

    /**
     * PUT /notifications/:id/read
     * Mark a notification as read
     */
    markAsRead = async (req: AuthRequest, res: Response) => {
        try {
            const userId = req.user?.id;
            if (!userId) return res.status(401).json({ message: "User ID required" });

            await this.notificationService.markAsRead(req.params.id, userId);
            return res.json({ message: "Notification marked as read" });
        } catch (error) {
            log.error("Error marking notification", { error: (error as Error).message });
            return res.status(500).json({ message: "Internal server error" });
        }
    };

    /**
     * PUT /notifications/read-all
     * Mark all notifications as read
     */
    markAllAsRead = async (req: AuthRequest, res: Response) => {
        try {
            const userId = req.user?.id;
            if (!userId) return res.status(401).json({ message: "User ID required" });

            await this.notificationService.markAllAsRead(userId);
            return res.json({ message: "All notifications marked as read" });
        } catch (error) {
            log.error("Error marking all notifications", { error: (error as Error).message });
            return res.status(500).json({ message: "Internal server error" });
        }
    };

    /**
     * POST /notifications/push-token
     * Register a push notification token
     */
    registerPushToken = async (req: AuthRequest, res: Response) => {
        try {
            const userId = req.user?.id;
            if (!userId) return res.status(401).json({ message: "User ID required" });

            const { token, platform } = req.body;

            if (!token || !platform) {
                return res.status(400).json({ message: "token and platform are required" });
            }

            if (!Object.values(DevicePlatform).includes(platform)) {
                return res.status(400).json({ message: "platform must be 'ios' or 'android'" });
            }

            const pushToken = await this.notificationService.registerPushToken(userId, token, platform);
            return res.status(201).json({ pushToken });
        } catch (error) {
            log.error("Error registering push token", { error: (error as Error).message });
            return res.status(500).json({ message: "Internal server error" });
        }
    };

    /**
     * DELETE /notifications/push-token
     * Remove push token (on logout)
     */
    removePushToken = async (req: AuthRequest, res: Response) => {
        try {
            const userId = req.user?.id;
            if (!userId) return res.status(401).json({ message: "User ID required" });

            const { token } = req.body;

            if (!token) {
                return res.status(400).json({ message: "token is required" });
            }

            await this.notificationService.removePushToken(userId, token);
            return res.json({ message: "Push token removed" });
        } catch (error) {
            log.error("Error removing push token", { error: (error as Error).message });
            return res.status(500).json({ message: "Internal server error" });
        }
    };
}
