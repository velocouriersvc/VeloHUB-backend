import { AppDataSource } from "../db/data-source";
import { Order, OrderStatus, DeliveryType, OrderCancelledBy } from "../models/order";
import { OrderStatusHistory } from "../models/order-status-history";
import { MerchantProfile } from "../models/merchant-profile";
import { SettlementService, SettlementResult } from "./settlement-service";
import { NotificationService } from "./notification-service";
import { NotificationType } from "../models/notification";
import { redis } from "../utils/redis";
import { createServiceLogger } from "../utils/logger";
import { orderEventsTotal } from "../utils/metrics";
import { emitOrderEvent } from "../socket-gateway";

const log = createServiceLogger("DeliveryService");

// Redis keys
const DELIVERY_LOCK_KEY = (orderId: string) => `delivery:lock:${orderId}`;
const DELIVERY_LOCK_TTL = 15; // seconds — prevent double-accept

// ── Result Types ────────────────────────────────────────────────────

export interface AvailableDelivery {
    orderId: string;
    orderNumber: string;
    merchantName: string;
    merchantLat: number | null;
    merchantLng: number | null;
    deliveryAddress: string | null;
    deliveryLat: number | null;
    deliveryLng: number | null;
    estimatedDistanceKm: number | null;
    deliveryFee: number;
    itemCount: number;
    currency: string;
    createdAt: Date;
}

// ── Service ─────────────────────────────────────────────────────────

/**
 * DeliveryService — Driver-facing delivery operations.
 *
 * - List available deliveries nearby
 * - Accept a delivery
 * - Update delivery status (picked_up → in_transit → delivered)
 * - Complete delivery → trigger settlement
 */
export class DeliveryService {
    private orderRepo = AppDataSource.getRepository(Order);
    private historyRepo = AppDataSource.getRepository(OrderStatusHistory);
    private merchantProfileRepo = AppDataSource.getRepository(MerchantProfile);

    private settlementService = new SettlementService();
    private notificationService = new NotificationService();

    // ── Available Deliveries ────────────────────────────────────────

    /**
     * Get available deliveries — orders that are READY_FOR_PICKUP + delivery type.
     * Optionally filters by driver's lat/lng proximity (simple distance filter).
     */
    async getAvailableDeliveries(
        driverId: string,
        params?: { lat?: number; lng?: number; radiusKm?: number }
    ): Promise<AvailableDelivery[]> {
        const qb = this.orderRepo
            .createQueryBuilder("order")
            .leftJoinAndSelect("order.merchant", "merchant")
            .leftJoin("merchant.merchantProfile", "profile")
            .addSelect(["profile.businessName", "profile.latitude", "profile.longitude"])
            .where("order.deliveryType = :deliveryType", { deliveryType: DeliveryType.DELIVERY })
            .andWhere("order.status = :status", { status: OrderStatus.READY_FOR_DELIVERY })
            .andWhere("order.driverId IS NULL")
            .orderBy("order.createdAt", "ASC"); // oldest first — FIFO

        const orders = await qb.getMany();

        // Map to AvailableDelivery with merchant info
        const deliveries: AvailableDelivery[] = [];

        for (const order of orders) {
            // Load merchant profile separately if not joined properly
            const merchantProfile = await this.merchantProfileRepo.findOne({
                where: { userId: order.merchantId },
            });

            const merchantLat = merchantProfile?.latitude || null;
            const merchantLng = merchantProfile?.longitude || null;

            // Calculate distance if driver location provided
            let estimatedDistanceKm: number | null = null;
            if (params?.lat && params?.lng && merchantLat && merchantLng) {
                estimatedDistanceKm = this.haversineDistance(
                    merchantLat,
                    merchantLng,
                    params.lat,
                    params.lng
                );

                // Filter by radius
                const radiusKm = params.radiusKm || 15;
                if (estimatedDistanceKm > radiusKm) {
                    continue; // too far — skip
                }
            }

            deliveries.push({
                orderId: order.id,
                orderNumber: order.orderNumber,
                merchantName: merchantProfile?.businessName || "Unknown Merchant",
                merchantLat,
                merchantLng,
                deliveryAddress: order.deliveryAddress,
                deliveryLat: order.deliveryLat,
                deliveryLng: order.deliveryLng,
                estimatedDistanceKm: estimatedDistanceKm
                    ? Math.round(estimatedDistanceKm * 10) / 10
                    : null,
                deliveryFee: Number(order.deliveryFee),
                itemCount: Array.isArray(order.items) ? order.items.length : 0,
                currency: order.currency || "GHS",
                createdAt: order.createdAt,
            });
        }

        return deliveries;
    }

    // ── Accept Delivery ─────────────────────────────────────────────

    /**
     * Driver accepts a delivery order.
     * Uses Redis lock to prevent double-accept.
     */
    async acceptDelivery(driverId: string, orderId: string): Promise<Order> {
        // Acquire lock
        const lockKey = DELIVERY_LOCK_KEY(orderId);
        const lockAcquired = await redis.set(lockKey, driverId, "EX", DELIVERY_LOCK_TTL, "NX");
        if (lockAcquired !== "OK") {
            throw new Error("This delivery is being claimed by another driver");
        }

        try {
            const order = await this.orderRepo.findOne({ where: { id: orderId } });

            if (!order) throw new Error("Order not found");

            if (order.deliveryType !== DeliveryType.DELIVERY) {
                throw new Error("This is not a delivery order");
            }

            if (order.status !== OrderStatus.READY_FOR_DELIVERY) {
                throw new Error(`Cannot accept delivery — order status is "${order.status}"`);
            }

            if (order.driverId) {
                throw new Error("This delivery has already been assigned to another driver");
            }

            // Assign driver
            const fromStatus = order.status;
            order.driverId = driverId;
            order.status = OrderStatus.DRIVER_ASSIGNED;

            await this.orderRepo.save(order);
            await this.recordStatusChange(orderId, fromStatus, OrderStatus.DRIVER_ASSIGNED, driverId, "driver", "Driver accepted delivery");

            // Emit WebSocket event for real-time tracking
            emitOrderEvent(orderId, "order:status", {
                orderId,
                status: OrderStatus.DRIVER_ASSIGNED,
                updatedAt: new Date().toISOString(),
            });

            // Notify customer
            await this.notificationService.notify(
                order.customerId,
                NotificationType.ORDER_PICKED_UP,
                "Driver Assigned! 🚗",
                `A driver has been assigned to deliver your order #${order.orderNumber}.`,
                { orderId, orderNumber: order.orderNumber, status: OrderStatus.DRIVER_ASSIGNED }
            );

            // Notify merchant
            await this.notificationService.notify(
                order.merchantId,
                NotificationType.ORDER_PICKED_UP,
                "Driver Assigned",
                `A driver has been assigned to pick up order #${order.orderNumber}.`,
                { orderId, orderNumber: order.orderNumber, status: OrderStatus.DRIVER_ASSIGNED }
            );

            orderEventsTotal.inc({ status: "driver_assigned", type: "delivery" });
            log.info("Delivery accepted", { orderId, driverId });

            return order;
        } finally {
            await redis.del(lockKey);
        }
    }

    /**
     * Driver cancels delivery assignment.
     * Only allowed before the order is PICKED_UP.
     * Resets status to READY_FOR_DELIVERY and notifies merchant.
     */
    async cancelDeliveryAssignment(driverId: string, orderId: string, reason?: string): Promise<Order> {
        const order = await this.orderRepo.findOne({
            where: { id: orderId, driverId },
            relations: { merchant: true },
        });

        if (!order) {
            throw new Error("Order not found or not assigned to you");
        }

        if (order.status !== OrderStatus.DRIVER_ASSIGNED) {
            throw new Error(`Cannot cancel assignment — order status is "${order.status}". You can only cancel before pickup.`);
        }

        const fromStatus = order.status;
        order.driverId = null;
        order.status = OrderStatus.READY_FOR_DELIVERY;

        await this.orderRepo.save(order);
        await this.recordStatusChange(orderId, fromStatus, OrderStatus.READY_FOR_DELIVERY, driverId, "driver", reason || "Driver cancelled assignment");

        // Emit WebSocket event for real-time tracking
        emitOrderEvent(orderId, "order:status", {
            orderId,
            status: OrderStatus.READY_FOR_DELIVERY,
            updatedAt: new Date().toISOString(),
        });

        // Notify merchant
        await this.notificationService.notify(
            order.merchantId,
            NotificationType.ORDER_CANCELLED,
            "Driver Assignment Cancelled ⚠️",
            `The driver assigned to order #${order.orderNumber} has cancelled. The order is back in the delivery pool.`,
            { orderId, orderNumber: order.orderNumber, status: OrderStatus.READY_FOR_DELIVERY }
        );

        log.info("Delivery assignment cancelled by driver", { orderId, driverId, reason });

        return order;
    }

    // ── Update Delivery Status ──────────────────────────────────────

    /**
     * Driver updates delivery status.
     * Allowed transitions: DRIVER_ASSIGNED → PICKED_UP → IN_TRANSIT → DELIVERED
     */
    async updateDeliveryStatus(
        driverId: string,
        orderId: string,
        newStatus: OrderStatus
    ): Promise<Order> {
        const order = await this.orderRepo.findOne({
            where: { id: orderId, driverId },
        });

        if (!order) throw new Error("Order not found or not assigned to you");

        // Validate allowed transitions for driver
        const allowedTransitions: Record<string, string[]> = {
            [OrderStatus.DRIVER_ASSIGNED]: [OrderStatus.PICKED_UP],
            [OrderStatus.PICKED_UP]: [OrderStatus.IN_TRANSIT],
            [OrderStatus.IN_TRANSIT]: [OrderStatus.DELIVERED],
        };

        const allowed = allowedTransitions[order.status];
        if (!allowed || !allowed.includes(newStatus)) {
            throw new Error(
                `Cannot transition from "${order.status}" to "${newStatus}". Allowed: ${allowed?.join(", ") || "none"}`
            );
        }

        const fromStatus = order.status;
        order.status = newStatus;

        // Set timestamps
        if (newStatus === OrderStatus.PICKED_UP) {
            order.pickedUpAt = new Date();
        } else if (newStatus === OrderStatus.DELIVERED) {
            order.deliveredAt = new Date();
        }

        await this.orderRepo.save(order);
        await this.recordStatusChange(orderId, fromStatus, newStatus, driverId, "driver");

        // Emit WebSocket event for real-time tracking
        emitOrderEvent(orderId, "order:status", {
            orderId,
            status: newStatus,
            updatedAt: new Date().toISOString(),
        });

        // Notify customer on key transitions
        const statusMessages: Record<string, { title: string; body: string; type: NotificationType }> = {
            [OrderStatus.PICKED_UP]: {
                title: "Order Picked Up! 📦",
                body: `Your order #${order.orderNumber} has been picked up from the merchant and is on the way!`,
                type: NotificationType.ORDER_PICKED_UP,
            },
            [OrderStatus.IN_TRANSIT]: {
                title: "Order On The Way! 🚗",
                body: `Your order #${order.orderNumber} is on its way to you!`,
                type: NotificationType.ORDER_IN_TRANSIT,
            },
            [OrderStatus.DELIVERED]: {
                title: "Order Delivered! 🎉",
                body: `Your order #${order.orderNumber} has been delivered. Enjoy!`,
                type: NotificationType.ORDER_DELIVERED,
            },
        };

        const msg = statusMessages[newStatus];
        if (msg) {
            await this.notificationService.notify(
                order.customerId,
                msg.type,
                msg.title,
                msg.body,
                { orderId, orderNumber: order.orderNumber, status: newStatus }
            );
        }

        // Also notify merchant when driver picks up
        if (newStatus === OrderStatus.PICKED_UP) {
            await this.notificationService.notify(
                order.merchantId,
                NotificationType.ORDER_PICKED_UP,
                "Order Picked Up by Driver",
                `Order #${order.orderNumber} has been picked up by the driver.`,
                { orderId, orderNumber: order.orderNumber, status: newStatus }
            );
        }

        orderEventsTotal.inc({ status: newStatus, type: "delivery" });
        log.info("Delivery status updated", { orderId, driverId, fromStatus, newStatus });

        return order;
    }

    // ── Complete Delivery ────────────────────────────────────────────

    /**
     * Driver confirms delivery complete → triggers settlement.
     */
    async completeDelivery(
        driverId: string,
        orderId: string
    ): Promise<{ order: Order; settlement: SettlementResult }> {
        const order = await this.orderRepo.findOne({
            where: { id: orderId, driverId },
        });

        if (!order) throw new Error("Order not found or not assigned to you");

        // Must be in DELIVERED or IN_TRANSIT status
        if (order.status !== OrderStatus.DELIVERED && order.status !== OrderStatus.IN_TRANSIT) {
            throw new Error(
                `Cannot complete delivery — order status is "${order.status}". Must be "delivered" or "in_transit".`
            );
        }

        // If still in_transit, transition to delivered first
        if (order.status === OrderStatus.IN_TRANSIT) {
            order.status = OrderStatus.DELIVERED;
            order.deliveredAt = new Date();
            await this.orderRepo.save(order);
            await this.recordStatusChange(orderId, OrderStatus.IN_TRANSIT, OrderStatus.DELIVERED, driverId, "driver", "Driver confirmed delivery");

            // Emit WebSocket event for real-time tracking
            emitOrderEvent(orderId, "order:status", {
                orderId,
                status: OrderStatus.DELIVERED,
                updatedAt: new Date().toISOString(),
            });
        }

        // Trigger settlement
        const settlement = await this.settlementService.settleOrder(orderId, driverId, "driver");

        // Re-fetch the settled order
        const settledOrder = await this.orderRepo.findOne({ where: { id: orderId } });

        return {
            order: settledOrder || order,
            settlement,
        };
    }

    // ── Driver Active Delivery ──────────────────────────────────────

    /**
     * Get driver's current active delivery (if any).
     */
    async getActiveDelivery(driverId: string): Promise<Order | null> {
        return this.orderRepo.findOne({
            where: {
                driverId,
                deliveryType: DeliveryType.DELIVERY,
            },
            relations: {
                customer: true,
                merchant: { merchantProfile: true },
            },
            order: { createdAt: "DESC" },
        });
    }

    /**
     * Get driver's delivery history.
     */
    async getDeliveryHistory(
        driverId: string,
        params: { page?: number; limit?: number }
    ): Promise<{ deliveries: Order[]; total: number; page: number; limit: number }> {
        const page = params.page || 1;
        const limit = Math.min(params.limit || 20, 50);
        const offset = (page - 1) * limit;

        const [deliveries, total] = await this.orderRepo.findAndCount({
            where: {
                driverId,
                deliveryType: DeliveryType.DELIVERY,
                status: OrderStatus.COMPLETED,
            },
            order: { completedAt: "DESC" },
            skip: offset,
            take: limit,
        });

        return { deliveries, total, page, limit };
    }

    // ── Helpers ──────────────────────────────────────────────────────

    /**
     * Haversine distance in km.
     */
    private haversineDistance(
        lat1: number,
        lng1: number,
        lat2: number,
        lng2: number
    ): number {
        const R = 6371;
        const toRad = (d: number) => (d * Math.PI) / 180;
        const dLat = toRad(lat2 - lat1);
        const dLng = toRad(lng2 - lng1);
        const a =
            Math.sin(dLat / 2) ** 2 +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }

    private async recordStatusChange(
        orderId: string,
        fromStatus: OrderStatus | null,
        toStatus: OrderStatus,
        changedBy: string,
        role: string,
        note?: string
    ): Promise<void> {
        const entry = this.historyRepo.create({
            orderId,
            fromStatus,
            toStatus,
            changedBy,
            changedByRole: role,
            note: note || null,
        });
        await this.historyRepo.save(entry);
    }
}
