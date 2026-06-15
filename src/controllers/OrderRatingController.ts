import { Response } from "express";
import { AuthRequest } from "../middleware/role-middleware";
import { OrderRatingService, CreateOrderRatingInput } from "../services/order-rating-service";
import { createServiceLogger } from "../utils/logger";

const log = createServiceLogger("OrderRatingController");

export class OrderRatingController {
    private ratingService = new OrderRatingService();

    // ── Rate Order ──────────────────────────────────────────────────

    /**
     * POST /ratings/order - Rate a completed marketplace order.
     */
    rateOrder = async (req: AuthRequest, res: Response) => {
        try {
            const userId = req.user?.id;
            if (!userId) return res.status(401).json({ message: "User ID required" });

            const { orderId, merchantRating, merchantComment, driverRating, driverComment } = req.body;

            if (!orderId) {
                return res.status(400).json({ message: "orderId is required" });
            }
            if (!merchantRating || merchantRating < 1 || merchantRating > 5) {
                return res.status(400).json({ message: "merchantRating is required and must be between 1 and 5" });
            }
            if (driverRating !== undefined && (driverRating < 1 || driverRating > 5)) {
                return res.status(400).json({ message: "driverRating must be between 1 and 5" });
            }

            const input: CreateOrderRatingInput = {
                orderId,
                merchantRating: Number(merchantRating),
                merchantComment,
                driverRating: driverRating ? Number(driverRating) : undefined,
                driverComment,
            };

            const rating = await this.ratingService.rateOrder(userId, input);

            return res.status(201).json({
                message: "Rating submitted",
                rating: {
                    id: rating.id,
                    orderId: rating.orderId,
                    merchantRating: rating.merchantRating,
                    merchantComment: rating.merchantComment,
                    driverRating: rating.driverRating,
                    driverComment: rating.driverComment,
                    createdAt: rating.createdAt,
                },
            });
        } catch (error) {
            const message = (error as Error).message;

            if (message.includes("not found")) {
                return res.status(404).json({ message });
            }
            if (message.includes("already been rated") || message.includes("not completed")) {
                return res.status(400).json({ message });
            }
            if (message.includes("do not own")) {
                return res.status(403).json({ message });
            }

            log.error("Error rating order", { error: message });
            return res.status(500).json({ message: "Internal server error" });
        }
    };

    // ── Get Order Rating ────────────────────────────────────────────

    /**
     * GET /ratings/order/:orderId - Get rating for a specific order.
     */
    getOrderRating = async (req: AuthRequest, res: Response) => {
        try {
            const { orderId } = req.params;
            if (!orderId) return res.status(400).json({ message: "orderId is required" });

            const rating = await this.ratingService.getOrderRating(orderId);

            return res.status(200).json({ rating: rating || null });
        } catch (error) {
            log.error("Error getting order rating", { error: (error as Error).message });
            return res.status(500).json({ message: "Internal server error" });
        }
    };

    // ── Merchant Reviews ────────────────────────────────────────────

    /**
     * GET /ratings/merchant/:merchantId - Public reviews for a merchant.
     */
    getMerchantRatings = async (req: AuthRequest, res: Response) => {
        try {
            const { merchantId } = req.params;
            if (!merchantId) return res.status(400).json({ message: "merchantId is required" });

            const page = Number(req.query.page) || 1;
            const limit = Math.min(Number(req.query.limit) || 20, 50);

            const result = await this.ratingService.getMerchantRatings(merchantId, { page, limit });

            return res.status(200).json(result);
        } catch (error) {
            log.error("Error getting merchant ratings", { error: (error as Error).message });
            return res.status(500).json({ message: "Internal server error" });
        }
    };
}
