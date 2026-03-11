import { AppDataSource } from "../db/data-source";
import { OrderRating } from "../models/order-rating";
import { Order, OrderStatus } from "../models/order";
import { MerchantService } from "./merchant-service";
import { NotificationService } from "./notification-service";
import { NotificationType } from "../models/notification";
import { createServiceLogger } from "../utils/logger";

const log = createServiceLogger("OrderRatingService");

// ── Input Types ─────────────────────────────────────────────────────

export interface CreateOrderRatingInput {
    orderId: string;
    merchantRating: number; // 1-5
    merchantComment?: string;
    driverRating?: number; // 1-5 (only if order had a driver)
    driverComment?: string;
}

// ── Service ─────────────────────────────────────────────────────────

/**
 * OrderRatingService — Handles post-order ratings for merchants and drivers.
 *
 * - Only the customer who placed the order can rate it.
 * - Merchant rating is always required (1-5).
 * - Driver rating is optional (only applicable if the order had a delivery driver).
 * - Each order can only be rated once (orderId is UNIQUE on order_ratings).
 * - Updates MerchantStats.averageRating on submit.
 */
export class OrderRatingService {
    private ratingRepo = AppDataSource.getRepository(OrderRating);
    private orderRepo = AppDataSource.getRepository(Order);
    private merchantService = new MerchantService();
    private notificationService = new NotificationService();

    /**
     * Rate a completed order — merchant + optional driver rating.
     */
    async rateOrder(customerId: string, input: CreateOrderRatingInput): Promise<OrderRating> {
        const { orderId, merchantRating, merchantComment, driverRating, driverComment } = input;

        // 1. Validate order exists and belongs to customer
        const order = await this.orderRepo.findOne({
            where: { id: orderId, customerId },
        });

        if (!order) {
            throw new Error("Order not found or does not belong to you");
        }

        // 2. Only allow rating completed orders
        if (order.status !== OrderStatus.COMPLETED) {
            throw new Error("You can only rate completed orders");
        }

        // 3. Check if already rated
        const existingRating = await this.ratingRepo.findOne({ where: { orderId } });
        if (existingRating) {
            throw new Error("You have already rated this order");
        }

        // 4. Validate merchant rating (1-5)
        if (!merchantRating || merchantRating < 1 || merchantRating > 5) {
            throw new Error("Merchant rating must be between 1 and 5");
        }

        // 5. Validate driver rating if provided (1-5)
        if (driverRating !== undefined && driverRating !== null) {
            if (driverRating < 1 || driverRating > 5) {
                throw new Error("Driver rating must be between 1 and 5");
            }
            if (!order.driverId) {
                throw new Error("This order did not have a delivery driver — cannot rate driver");
            }
        }

        // 6. Create rating
        const rating = this.ratingRepo.create({
            orderId,
            customerId,
            merchantId: order.merchantId,
            merchantRating,
            merchantComment: merchantComment || null,
            driverId: order.driverId,
            driverRating: driverRating ?? null,
            driverComment: driverComment || null,
        });

        const savedRating = await this.ratingRepo.save(rating);

        // 7. Update merchant stats (weighted average)
        await this.merchantService.updateRating(order.merchantId, merchantRating);

        // 8. Notify merchant of new review
        await this.notificationService.notify(
            order.merchantId,
            NotificationType.NEW_PRODUCT_REVIEW,
            "New Review ⭐",
            `You received a ${merchantRating}-star rating for order #${order.orderNumber}${merchantComment ? `: "${merchantComment}"` : ""}.`,
            {
                orderId,
                orderNumber: order.orderNumber,
                rating: merchantRating,
                comment: merchantComment,
            }
        );

        // 9. If driver was rated, update driver stats (future — DriverStats entity for deliveries)
        // For now, notify the driver
        if (order.driverId && driverRating) {
            await this.notificationService.notify(
                order.driverId,
                NotificationType.NEW_RATING,
                "Delivery Rating ⭐",
                `You received a ${driverRating}-star rating for delivery of order #${order.orderNumber}${driverComment ? `: "${driverComment}"` : ""}.`,
                {
                    orderId,
                    orderNumber: order.orderNumber,
                    rating: driverRating,
                    comment: driverComment,
                }
            );
        }

        log.info("Order rated", {
            orderId,
            customerId,
            merchantRating,
            driverRating: driverRating ?? "N/A",
        });

        return savedRating;
    }

    /**
     * Get rating for a specific order.
     */
    async getOrderRating(orderId: string): Promise<OrderRating | null> {
        return this.ratingRepo.findOne({
            where: { orderId },
            relations: { customer: true, merchantUser: true, driverUser: true },
        });
    }

    /**
     * Get all ratings for a merchant, paginated.
     */
    async getMerchantRatings(
        merchantId: string,
        params: { page?: number; limit?: number }
    ): Promise<{ ratings: OrderRating[]; total: number; page: number; limit: number }> {
        const page = params.page || 1;
        const limit = Math.min(params.limit || 20, 50);
        const offset = (page - 1) * limit;

        const [ratings, total] = await this.ratingRepo.findAndCount({
            where: { merchantId },
            relations: { customer: true, order: true },
            order: { createdAt: "DESC" },
            skip: offset,
            take: limit,
        });

        return { ratings, total, page, limit };
    }
}
