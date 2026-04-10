import { AppDataSource } from "../db/data-source";
import { Notification, NotificationType } from "../models/notification";
import { PushToken, DevicePlatform } from "../models/push-token";
import { PreludeService } from "./prelude-service";
import { createServiceLogger } from "../utils/logger";
import { notificationEventsTotal } from "../utils/metrics";
import { formatCurrency } from "../utils/currency";
import { Expo, ExpoPushMessage, ExpoPushTicket } from "expo-server-sdk";

const log = createServiceLogger("NotificationService");

export class NotificationService {
    private notifRepo = AppDataSource.getRepository(Notification);
    private pushTokenRepo = AppDataSource.getRepository(PushToken);
    private preludeService: PreludeService;
    private expo: Expo;

    constructor() {
        this.preludeService = new PreludeService();
        this.expo = new Expo({
            accessToken: process.env.EXPO_ACCESS_TOKEN,
        });
    }

    /**
     * Create an in-app notification (stored in DB for the notification screen)
     */
    async createNotification(
        userId: string,
        type: NotificationType,
        title: string,
        body: string,
        data?: Record<string, any>
    ): Promise<Notification> {
        const notification = this.notifRepo.create({
            userId,
            type,
            title,
            body,
            data: data || null,
            isRead: false,
        });

        return this.notifRepo.save(notification);
    }

    /**
     * Create in-app notification + send push notification
     */
    async notify(
        userId: string,
        type: NotificationType,
        title: string,
        body: string,
        data?: Record<string, any>
    ): Promise<Notification> {
        // 1. Save in-app notification
        const notification = await this.createNotification(userId, type, title, body, data);

        // 2. Send push notification (fire-and-forget, don't block)
        this.sendPushNotification(userId, title, body, data).catch((err) => {
            log.error("Push notification failed", { userId, error: (err as Error).message });
            notificationEventsTotal.inc({ channel: "push", status: "failed" });
        });

        return notification;
    }

    /**
     * Send SMS notification via Prelude
     */
    async notifyBySms(
        phoneNumber: string,
        message: string
    ): Promise<void> {
        try {
            await this.preludeService.sendSMS(phoneNumber, message);
        } catch (err) {
            log.error("SMS notification failed", { error: (err as Error).message });
        }
    }

    /**
     * Send WhatsApp notification via Prelude
     */
    async notifyByWhatsApp(
        phoneNumber: string,
        message: string
    ): Promise<void> {
        try {
            await this.preludeService.sendWhatsApp(phoneNumber, message);
        } catch (err) {
            log.error("WhatsApp notification failed", { error: (err as Error).message });
        }
    }

    /**
     * Get user's notifications (for the notification screen) — enriched with icons/categories.
     */
    async getUserNotifications(
        userId: string,
        limit: number = 30,
        offset: number = 0
    ): Promise<{ notifications: any[]; total: number; unreadCount: number }> {
        const [notifications, total] = await this.notifRepo.findAndCount({
            where: { userId },
            order: { createdAt: "DESC" },
            take: limit,
            skip: offset,
        });

        const unreadCount = await this.notifRepo.count({
            where: { userId, isRead: false },
        });

        // Enrich with UI metadata
        const enriched = notifications.map(n => {
            const ui = this.getUIMetadata(n.type);
            return {
                ...n,
                icon: ui.icon,
                color: ui.color,
                category: ui.category,
            };
        });

        return { notifications: enriched, total, unreadCount };
    }

    /**
     * Helper to map NotificationType to UI aesthetics (icons, colors).
     */
    private getUIMetadata(type: NotificationType): { icon: string; color: string; category: string } {
        switch (type) {
            case NotificationType.ORDER_PLACED:
            case NotificationType.ORDER_ACCEPTED:
            case NotificationType.SERVICE_REQUESTED:
                return { icon: "shopping-bag", color: "#34C759", category: "order" };
            
            case NotificationType.ORDER_READY:
            case NotificationType.ORDER_PICKED_UP:
            case NotificationType.DRIVER_ARRIVED:
                return { icon: "package", color: "#5856D6", category: "operational" };

            case NotificationType.ORDER_CANCELLED:
            case NotificationType.ORDER_REJECTED:
            case NotificationType.SERVICE_DECLINED:
            case NotificationType.SERVICE_CANCELLED:
                return { icon: "x-circle", color: "#FF3B30", category: "warning" };

            case NotificationType.WALLET_CREDITED:
            case NotificationType.PAYMENT_RECEIVED:
            case NotificationType.PAYOUT_COMPLETED:
                return { icon: "dollar-sign", color: "#FF9500", category: "finance" };

            case NotificationType.WALLET_DEBITED:
            case NotificationType.COMMISSION_DEDUCTED:
                return { icon: "arrow-down-right", color: "#8E8E93", category: "finance" };

            case NotificationType.LOW_STOCK_ALERT:
                return { icon: "alert-triangle", color: "#FFCC00", category: "inventory" };

            case NotificationType.NEW_RATING:
            case NotificationType.NEW_PRODUCT_REVIEW:
                return { icon: "star", color: "#FFD60A", category: "reputation" };

            default:
                return { icon: "bell", color: "#007AFF", category: "system" };
        }
    }

    /**
     * Mark a single notification as read
     */
    async markAsRead(notificationId: string, userId: string): Promise<void> {
        await this.notifRepo.update(
            { id: notificationId, userId },
            { isRead: true }
        );
    }

    /**
     * Mark all notifications as read for a user
     */
    async markAllAsRead(userId: string): Promise<void> {
        await this.notifRepo.update(
            { userId, isRead: false },
            { isRead: true }
        );
    }

    /**
     * Register a push token for a user
     */
    async registerPushToken(
        userId: string,
        token: string,
        platform: DevicePlatform
    ): Promise<PushToken> {
        // Deactivate any existing tokens with the same token string
        // (handles device transfer between users)
        await this.pushTokenRepo.update(
            { token },
            { isActive: false }
        );

        // Check if user already has this token
        const existing = await this.pushTokenRepo.findOne({
            where: { userId, token },
        });

        if (existing) {
            existing.isActive = true;
            existing.platform = platform;
            return this.pushTokenRepo.save(existing);
        }

        const pushToken = this.pushTokenRepo.create({
            userId,
            token,
            platform,
            isActive: true,
        });

        return this.pushTokenRepo.save(pushToken);
    }

    /**
     * Remove a push token (on logout)
     */
    async removePushToken(userId: string, token: string): Promise<void> {
        await this.pushTokenRepo.update(
            { userId, token },
            { isActive: false }
        );
    }

    /**
     * Send push notification via Expo Push API
     */
    private async sendPushNotification(
        userId: string,
        title: string,
        body: string,
        data?: Record<string, any>
    ): Promise<void> {
        const tokens = await this.pushTokenRepo.find({
            where: { userId, isActive: true },
        });

        if (tokens.length === 0) return;

        // Build messages — only for valid Expo push tokens
        const messages: ExpoPushMessage[] = [];
        for (const t of tokens) {
            if (!Expo.isExpoPushToken(t.token)) {
                log.warn("Invalid Expo push token, skipping", { userId, token: t.token });
                continue;
            }
            messages.push({
                to: t.token,
                sound: "default",
                title,
                body,
                data: data || {},
                priority: "high",
                channelId: "default",
            });
        }

        if (messages.length === 0) return;

        // Chunk and send via Expo Push API
        const chunks = this.expo.chunkPushNotifications(messages);
        for (const chunk of chunks) {
            try {
                const ticketChunk: ExpoPushTicket[] = await this.expo.sendPushNotificationsAsync(chunk);

                // Handle ticket errors — deactivate invalid tokens
                for (let i = 0; i < ticketChunk.length; i++) {
                    const ticket = ticketChunk[i];
                    if (ticket.status === "error") {
                        log.error("Push ticket error", {
                            userId,
                            error: ticket.message,
                            details: ticket.details,
                        });

                        // If the token is invalid, deactivate it
                        if (
                            ticket.details?.error === "DeviceNotRegistered" ||
                            ticket.details?.error === "InvalidCredentials"
                        ) {
                            const badToken = (chunk[i] as any).to as string;
                            await this.pushTokenRepo.update({ token: badToken }, { isActive: false });
                            log.info("Deactivated invalid push token", { token: badToken });
                        }
                    }
                }

                notificationEventsTotal.inc({ channel: "push", status: "success" });
            } catch (err) {
                log.error("Expo Push API error", { userId, error: (err as Error).message });
                notificationEventsTotal.inc({ channel: "push", status: "failed" });
            }
        }

        log.info("Push notification sent", { userId, title, deviceCount: messages.length });
    }

    // ── Convenience methods for common ride notifications ──

    async notifyRideAccepted(customerId: string, driverName: string, rideId: string) {
        return this.notify(customerId, NotificationType.RIDE_ACCEPTED, "Ride Accepted! 🚗", `${driverName} is on the way`, { rideId, screen: "rides", deepLink: `velohub://rides?rideId=${rideId}` });
    }

    async notifyDriverEnroute(customerId: string, driverName: string, rideId: string) {
        return this.notify(customerId, NotificationType.DRIVER_ENROUTE, "Driver En Route 🛣️", `${driverName} is heading to your pickup`, { rideId, screen: "rides", deepLink: `velohub://rides?rideId=${rideId}` });
    }

    async notifyDriverArrived(customerId: string, driverName: string, rideId: string) {
        return this.notify(customerId, NotificationType.DRIVER_ARRIVED, "Driver Arrived! 📍", `${driverName} has arrived at your pickup location`, { rideId, screen: "rides", deepLink: `velohub://rides?rideId=${rideId}` });
    }

    async notifyRideStarted(customerId: string, rideId: string) {
        return this.notify(customerId, NotificationType.RIDE_STARTED, "Ride Started 🚀", "Your ride is now in progress", { rideId, screen: "rides", deepLink: `velohub://rides?rideId=${rideId}` });
    }

    async notifyRideCompleted(customerId: string, fare: number, rideId: string, currency: string = "GHS") {
        return this.notify(customerId, NotificationType.RIDE_COMPLETED, "Ride Completed ✅", `Your ride is complete. Fare: ${formatCurrency(fare, currency)}`, { rideId, fare, screen: "rides", deepLink: `velohub://rides?rideId=${rideId}` });
    }

    async notifyRideCancelled(userId: string, reason: string, rideId: string) {
        return this.notify(userId, NotificationType.RIDE_CANCELLED, "Ride Cancelled ❌", reason, { rideId, screen: "rides", deepLink: `velohub://rides?rideId=${rideId}` });
    }

    async notifyPaymentReceived(userId: string, amount: number, rideId: string, currency: string = "GHS") {
        return this.notify(userId, NotificationType.PAYMENT_RECEIVED, "Payment Received 💰", `${formatCurrency(amount, currency)} received`, { rideId, amount });
    }

    async notifyDriverEarnings(driverId: string, amount: number, rideId: string, currency: string = "GHS") {
        return this.notify(driverId, NotificationType.WALLET_CREDITED, "Earnings Credited 💵", `${formatCurrency(amount, currency)} added to your wallet`, { rideId, amount });
    }

    async notifyNewRating(driverId: string, rating: number, rideId: string) {
        return this.notify(driverId, NotificationType.NEW_RATING, "New Rating ⭐", `You received a ${rating}-star rating`, { rideId, rating });
    }

    async notifyNewRideRequest(driverId: string, pickupAddress: string, rideId: string) {
        return this.notify(driverId, NotificationType.RIDE_REQUESTED, "New Ride Request! 🔔", `Pickup: ${pickupAddress}`, { rideId, screen: "rides", deepLink: `velohub://rides?rideId=${rideId}` });
    }
}
