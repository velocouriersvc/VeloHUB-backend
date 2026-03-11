import { AppDataSource } from "../db/data-source";
import { Notification, NotificationType } from "../models/notification";
import { PushToken, DevicePlatform } from "../models/push-token";
import { TwilioService } from "./twilio-service";
import { createServiceLogger } from "../utils/logger";
import { notificationEventsTotal } from "../utils/metrics";

const log = createServiceLogger("NotificationService");

export class NotificationService {
    private notifRepo = AppDataSource.getRepository(Notification);
    private pushTokenRepo = AppDataSource.getRepository(PushToken);
    private twilioService: TwilioService;

    constructor() {
        this.twilioService = new TwilioService();
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
            log.error("Push notification failed", { userId, error: err.message });
            notificationEventsTotal.inc({ channel: "push", status: "failed" });
        });

        return notification;
    }

    /**
     * Send SMS notification via Twilio
     */
    async notifyBySms(
        phoneNumber: string,
        message: string
    ): Promise<void> {
        try {
            await this.twilioService.sendSMS(phoneNumber, message);
        } catch (err: any) {
            log.error("SMS notification failed", { error: err.message });
        }
    }

    /**
     * Send WhatsApp notification via Twilio
     */
    async notifyByWhatsApp(
        phoneNumber: string,
        message: string
    ): Promise<void> {
        try {
            await this.twilioService.sendWhatsApp(phoneNumber, message);
        } catch (err: any) {
            log.error("WhatsApp notification failed", { error: err.message });
        }
    }

    /**
     * Get user's notifications (for the notification screen)
     */
    async getUserNotifications(
        userId: string,
        limit: number = 30,
        offset: number = 0
    ): Promise<{ notifications: Notification[]; total: number; unreadCount: number }> {
        const [notifications, total] = await this.notifRepo.findAndCount({
            where: { userId },
            order: { createdAt: "DESC" },
            take: limit,
            skip: offset,
        });

        const unreadCount = await this.notifRepo.count({
            where: { userId, isRead: false },
        });

        return { notifications, total, unreadCount };
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
     * Send push notification via FCM (placeholder — wire up Firebase Admin SDK)
     * TODO: Add firebase-admin dependency and initialize when ready for push
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

        // TODO: Replace with actual FCM send when firebase-admin is added
        // For now, just log that we would send a push
        log.info("Push notification queued", { userId, title, deviceCount: tokens.length });
        notificationEventsTotal.inc({ channel: "push", status: "success" });

        // When ready, implement like this:
        // import admin from "firebase-admin";
        // const message = {
        //     notification: { title, body },
        //     data: data ? Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v)])) : {},
        //     tokens: tokens.map(t => t.token),
        // };
        // await admin.messaging().sendEachForMulticast(message);
    }

    // ── Convenience methods for common ride notifications ──

    async notifyRideAccepted(customerId: string, driverName: string, rideId: string) {
        return this.notify(customerId, NotificationType.RIDE_ACCEPTED, "Ride Accepted! 🚗", `${driverName} is on the way`, { rideId });
    }

    async notifyDriverEnroute(customerId: string, driverName: string, rideId: string) {
        return this.notify(customerId, NotificationType.DRIVER_ENROUTE, "Driver En Route 🛣️", `${driverName} is heading to your pickup`, { rideId });
    }

    async notifyDriverArrived(customerId: string, driverName: string, rideId: string) {
        return this.notify(customerId, NotificationType.DRIVER_ARRIVED, "Driver Arrived! 📍", `${driverName} has arrived at your pickup location`, { rideId });
    }

    async notifyRideStarted(customerId: string, rideId: string) {
        return this.notify(customerId, NotificationType.RIDE_STARTED, "Ride Started 🚀", "Your ride is now in progress", { rideId });
    }

    async notifyRideCompleted(customerId: string, fare: number, rideId: string) {
        return this.notify(customerId, NotificationType.RIDE_COMPLETED, "Ride Completed ✅", `Your ride is complete. Fare: GHS ${fare.toFixed(2)}`, { rideId, fare });
    }

    async notifyRideCancelled(userId: string, reason: string, rideId: string) {
        return this.notify(userId, NotificationType.RIDE_CANCELLED, "Ride Cancelled ❌", reason, { rideId });
    }

    async notifyPaymentReceived(userId: string, amount: number, rideId: string) {
        return this.notify(userId, NotificationType.PAYMENT_RECEIVED, "Payment Received 💰", `GHS ${amount.toFixed(2)} received`, { rideId, amount });
    }

    async notifyDriverEarnings(driverId: string, amount: number, rideId: string) {
        return this.notify(driverId, NotificationType.WALLET_CREDITED, "Earnings Credited 💵", `GHS ${amount.toFixed(2)} added to your wallet`, { rideId, amount });
    }

    async notifyNewRating(driverId: string, rating: number, rideId: string) {
        return this.notify(driverId, NotificationType.NEW_RATING, "New Rating ⭐", `You received a ${rating}-star rating`, { rideId, rating });
    }

    async notifyNewRideRequest(driverId: string, pickupAddress: string, rideId: string) {
        return this.notify(driverId, NotificationType.RIDE_REQUESTED, "New Ride Request! 🔔", `Pickup: ${pickupAddress}`, { rideId });
    }
}
