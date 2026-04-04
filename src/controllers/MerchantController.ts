import { Response } from "express";
import { AuthRequest } from "../middleware/role-middleware";
import { MerchantService, OperatingHoursInput } from "../services/merchant-service";
import { UploadService } from "../services/upload-service";
import { OrderStatus } from "../models/order";
import { MerchantProfile } from "../models/merchant-profile";
import { AppDataSource } from "../db/data-source";
import { createServiceLogger } from "../utils/logger";

const log = createServiceLogger("MerchantController");

export class MerchantController {
    private merchantService = new MerchantService();
    private uploadService = new UploadService();

    // ── Dashboard ───────────────────────────────────────────────────

    /**
     * GET /merchant/dashboard — Merchant dashboard overview.
     */
    getDashboard = async (req: AuthRequest, res: Response) => {
        try {
            const merchantId = req.user?.id;
            if (!merchantId) return res.status(401).json({ message: "User ID required" });

            const dashboard = await this.merchantService.getDashboard(merchantId);
            return res.status(200).json(dashboard);
        } catch (error) {
            const message = (error as Error).message;
            if (message.includes("not found")) {
                return res.status(404).json({ message });
            }
            log.error("Error getting dashboard", { error: message });
            return res.status(500).json({ message: "Internal server error" });
        }
    };

    // ── Profile ─────────────────────────────────────────────────────

    /**
     * GET /merchant/profile — Get merchant profile.
     */
    getProfile = async (req: AuthRequest, res: Response) => {
        try {
            const merchantId = req.user?.id;
            if (!merchantId) return res.status(401).json({ message: "User ID required" });

            const profile = await this.merchantService.getProfile(merchantId);
            if (!profile) {
                return res.status(404).json({ message: "Merchant profile not found" });
            }

            return res.status(200).json(profile);
        } catch (error) {
            log.error("Error getting profile", { error: (error as Error).message });
            return res.status(500).json({ message: "Internal server error" });
        }
    };

    /**
     * PUT /merchant/profile — Update merchant profile.
     */
    updateProfile = async (req: AuthRequest, res: Response) => {
        try {
            const merchantId = req.user?.id;
            if (!merchantId) return res.status(401).json({ message: "User ID required" });

            const profile = await this.merchantService.updateProfile(merchantId, req.body);
            return res.status(200).json(profile);
        } catch (error) {
            const message = (error as Error).message;
            if (message.includes("not found")) {
                return res.status(404).json({ message });
            }
            log.error("Error updating profile", { error: message });
            return res.status(500).json({ message: "Internal server error" });
        }
    };

    /**
     * POST /merchant/profile/cover-image — Upload cover image.
     */
    uploadCoverImage = async (req: AuthRequest, res: Response) => {
        try {
            const merchantId = req.user?.id;
            if (!merchantId) return res.status(401).json({ message: "User ID required" });

            const file = req.file;
            if (!file) {
                return res.status(400).json({ message: "No file provided" });
            }

            const uploadResult = await this.uploadService.uploadFile(
                file.buffer,
                file.originalname,
                file.mimetype,
                merchantId,
                "merchants"
            );

            const profile = await this.merchantService.updateProfile(merchantId, {
                coverImageUrl: uploadResult.url,
            });

            return res.status(200).json({ imageUrl: uploadResult.url, profile });
        } catch (error) {
            log.error("Error uploading cover image", { error: (error as Error).message });
            return res.status(500).json({ message: "Internal server error" });
        }
    };

    /**
     * PATCH /merchant/toggle-open — Toggle merchant open/close status.
     */
    toggleOpen = async (req: AuthRequest, res: Response) => {
        try {
            const merchantId = req.user?.id;
            if (!merchantId) return res.status(401).json({ message: "User ID required" });

            const { isOpen } = req.body;
            if (typeof isOpen !== "boolean") {
                return res.status(400).json({ message: "isOpen (boolean) is required" });
            }

            const profile = await this.merchantService.toggleOpen(merchantId, isOpen);
            return res.status(200).json(profile);
        } catch (error) {
            const message = (error as Error).message;
            if (message.includes("not found")) {
                return res.status(404).json({ message });
            }
            log.error("Error toggling open status", { error: message });
            return res.status(500).json({ message: "Internal server error" });
        }
    };

    // ── Operating Hours ─────────────────────────────────────────────

    /**
     * GET /merchant/hours — Get operating hours.
     */
    getOperatingHours = async (req: AuthRequest, res: Response) => {
        try {
            const merchantId = req.user?.id;
            if (!merchantId) return res.status(401).json({ message: "User ID required" });

            const hours = await this.merchantService.getOperatingHours(merchantId);
            return res.status(200).json(hours);
        } catch (error) {
            log.error("Error getting operating hours", { error: (error as Error).message });
            return res.status(500).json({ message: "Internal server error" });
        }
    };

    /**
     * PUT /merchant/hours — Set all operating hours (upsert 7 days).
     */
    setOperatingHours = async (req: AuthRequest, res: Response) => {
        try {
            const merchantId = req.user?.id;
            if (!merchantId) return res.status(401).json({ message: "User ID required" });

            const { hours } = req.body;
            if (!Array.isArray(hours)) {
                return res.status(400).json({ message: "hours array is required" });
            }

            // Validate each entry
            for (const h of hours) {
                if (h.dayOfWeek === undefined || h.dayOfWeek < 0 || h.dayOfWeek > 6) {
                    return res.status(400).json({ message: "Each entry needs dayOfWeek (0-6)" });
                }
            }

            const result = await this.merchantService.setOperatingHours(merchantId, hours);
            return res.status(200).json(result);
        } catch (error) {
            log.error("Error setting operating hours", { error: (error as Error).message });
            return res.status(500).json({ message: (error as Error).message || "Internal server error" });
        }
    };

    /**
     * PATCH /merchant/hours/:dayOfWeek — Update a single day's hours.
     */
    updateDayHours = async (req: AuthRequest, res: Response) => {
        try {
            const merchantId = req.user?.id;
            if (!merchantId) return res.status(401).json({ message: "User ID required" });

            const dayOfWeek = Number(req.params.dayOfWeek);
            if (isNaN(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6) {
                return res.status(400).json({ message: "dayOfWeek must be 0-6" });
            }

            const result = await this.merchantService.updateDayHours(merchantId, dayOfWeek, req.body);
            return res.status(200).json(result);
        } catch (error) {
            log.error("Error updating day hours", { error: (error as Error).message });
            return res.status(500).json({ message: "Internal server error" });
        }
    };

    // ── Orders ──────────────────────────────────────────────────────

    /**
     * GET /merchant/orders — List merchant's orders.
     */
    getOrders = async (req: AuthRequest, res: Response) => {
        try {
            const merchantId = req.user?.id;
            if (!merchantId) return res.status(401).json({ message: "User ID required" });

            const { status, page, limit } = req.query;
            const result = await this.merchantService.getOrders(merchantId, {
                status: status as OrderStatus,
                page: page ? Number(page) : undefined,
                limit: limit ? Number(limit) : undefined,
            });

            return res.status(200).json(result);
        } catch (error) {
            log.error("Error listing merchant orders", { error: (error as Error).message });
            return res.status(500).json({ message: "Internal server error" });
        }
    };

    /**
     * PATCH /merchant/orders/:orderId/accept — Accept a pending order.
     */
    acceptOrder = async (req: AuthRequest, res: Response) => {
        try {
            const merchantId = req.user?.id;
            if (!merchantId) return res.status(401).json({ message: "User ID required" });

            const { orderId } = req.params;
            const { estimatedPrepTime } = req.body;

            const order = await this.merchantService.acceptOrder(merchantId, orderId, estimatedPrepTime);
            return res.status(200).json(order);
        } catch (error) {
            const message = (error as Error).message;
            if (message.includes("not found")) {
                return res.status(404).json({ message });
            }
            if (message.includes("Cannot")) {
                return res.status(400).json({ message });
            }
            log.error("Error accepting order", { error: message });
            return res.status(500).json({ message: "Internal server error" });
        }
    };

    /**
     * PATCH /merchant/orders/:orderId/reject — Reject a pending order.
     */
    rejectOrder = async (req: AuthRequest, res: Response) => {
        try {
            const merchantId = req.user?.id;
            if (!merchantId) return res.status(401).json({ message: "User ID required" });

            const { orderId } = req.params;
            const { reason } = req.body;

            if (!reason) {
                return res.status(400).json({ message: "reason is required" });
            }

            const order = await this.merchantService.rejectOrder(merchantId, orderId, reason);
            return res.status(200).json(order);
        } catch (error) {
            const message = (error as Error).message;
            if (message.includes("not found")) {
                return res.status(404).json({ message });
            }
            if (message.includes("Cannot")) {
                return res.status(400).json({ message });
            }
            log.error("Error rejecting order", { error: message });
            return res.status(500).json({ message: "Internal server error" });
        }
    };

    /**
     * PATCH /merchant/orders/:orderId/status — Update order status.
     */
    updateOrderStatus = async (req: AuthRequest, res: Response) => {
        try {
            const merchantId = req.user?.id;
            if (!merchantId) return res.status(401).json({ message: "User ID required" });

            const { orderId } = req.params;
            const { status } = req.body;

            if (!status) {
                return res.status(400).json({ message: "status is required" });
            }

            const order = await this.merchantService.updateOrderStatus(merchantId, orderId, status);
            return res.status(200).json(order);
        } catch (error) {
            const message = (error as Error).message;
            if (message.includes("not found")) {
                return res.status(404).json({ message });
            }
            if (message.includes("Cannot") || message.includes("transition")) {
                return res.status(400).json({ message });
            }
            log.error("Error updating order status", { error: message });
            return res.status(500).json({ message: "Internal server error" });
        }
    };

    /**
     * POST /merchant/orders/:orderId/verify-pickup — Verify pickup code.
     */
    verifyPickupCode = async (req: AuthRequest, res: Response) => {
        try {
            const merchantId = req.user?.id;
            if (!merchantId) return res.status(401).json({ message: "User ID required" });

            const { orderId } = req.params;
            const { code } = req.body;

            if (!code) {
                return res.status(400).json({ message: "code is required" });
            }

            const result = await this.merchantService.verifyPickupCode(merchantId, orderId, code);

            if (!result.verified) {
                return res.status(400).json({ message: "Invalid pickup code", verified: false });
            }

            return res.status(200).json({ message: "Pickup code verified", verified: true, order: result.order });
        } catch (error) {
            const message = (error as Error).message;
            if (message.includes("not found")) {
                return res.status(404).json({ message });
            }
            if (message.includes("Cannot")) {
                return res.status(400).json({ message });
            }
            log.error("Error verifying pickup code", { error: message });
            return res.status(500).json({ message: "Internal server error" });
        }
    };

    /**
     * POST /merchant/orders/:orderId/complete-pickup — Verify pickup code + trigger settlement.
     */
    completePickupOrder = async (req: AuthRequest, res: Response) => {
        try {
            const merchantId = req.user?.id;
            if (!merchantId) return res.status(401).json({ message: "User ID required" });

            const { orderId } = req.params;
            const { code } = req.body;

            if (!code) {
                return res.status(400).json({ message: "code is required" });
            }

            const result = await this.merchantService.completePickupOrder(merchantId, orderId, code);

            return res.status(200).json({
                message: "Pickup verified! Order completed.",
                order: result.order,
                settlement: {
                    merchantEarnings: result.settlement.merchantEarnings,
                    platformFee: result.settlement.platformFee,
                    driverEarnings: result.settlement.driverEarnings,
                    settlementType: result.settlement.settlementType,
                    walletCredited: result.settlement.merchantWalletCredited,
                },
            });
        } catch (error) {
            const message = (error as Error).message;
            if (message.includes("not found")) {
                return res.status(404).json({ message });
            }
            if (message.includes("Invalid pickup code")) {
                return res.status(400).json({ message: "Invalid pickup code", verified: false });
            }
            if (message.includes("Cannot") || message.includes("already been settled")) {
                return res.status(400).json({ message });
            }
            log.error("Error completing pickup order", { error: message });
            return res.status(500).json({ message: "Internal server error" });
        }
    };

    /**
     * POST /merchant/request-payout — Request wallet payout.
     */
    requestPayout = async (req: AuthRequest, res: Response) => {
        try {
            const merchantId = req.user?.id;
            if (!merchantId) return res.status(401).json({ message: "User ID required" });

            const { amount, payoutMethod, accountNumber } = req.body;

            if (!amount || amount <= 0) {
                return res.status(400).json({ message: "Amount must be greater than 0" });
            }
            if (!payoutMethod) {
                return res.status(400).json({ message: "payoutMethod is required (e.g., momo, bank)" });
            }
            if (!accountNumber) {
                return res.status(400).json({ message: "accountNumber is required" });
            }

            const result = await this.merchantService.requestPayout(merchantId, {
                amount: Number(amount),
                payoutMethod,
                accountNumber,
            });

            return res.status(200).json(result);
        } catch (error) {
            const message = (error as Error).message;
            if (message.includes("Insufficient")) {
                return res.status(400).json({ message });
            }
            log.error("Error requesting payout", { error: message });
            return res.status(500).json({ message: "Internal server error" });
        }
    };

    // ── Finances ────────────────────────────────────────────────────

    /**
     * GET /merchant/finances — Financial overview.
     */
    getFinances = async (req: AuthRequest, res: Response) => {
        try {
            const merchantId = req.user?.id;
            if (!merchantId) return res.status(401).json({ message: "User ID required" });

            const finances = await this.merchantService.getFinances(merchantId);
            return res.status(200).json(finances);
        } catch (error) {
            log.error("Error getting finances", { error: (error as Error).message });
            return res.status(500).json({ message: "Internal server error" });
        }
    };

    // ── Stats ───────────────────────────────────────────────────────

    /**
     * GET /merchant/stats — Merchant stats.
     */
    getStats = async (req: AuthRequest, res: Response) => {
        try {
            const merchantId = req.user?.id;
            if (!merchantId) return res.status(401).json({ message: "User ID required" });

            const stats = await this.merchantService.getStats(merchantId);
            return res.status(200).json(stats || { totalOrders: 0, totalRevenue: 0, averageRating: 0, ratingCount: 0, totalProducts: 0 });
        } catch (error) {
            log.error("Error getting stats", { error: (error as Error).message });
            return res.status(500).json({ message: "Internal server error" });
        }
    };
    /**
     * POST /merchant/:slugOrId/view — Increment store view count (public).
     */
    viewProfile = async (req: AuthRequest, res: Response) => {
        try {
            const { slugOrId } = req.params;
            await this.merchantService.incrementViewCount(slugOrId);
            return res.status(200).json({ success: true });
        } catch (error) {
            log.error("Error incrementing store view", { error: (error as Error).message });
            return res.status(500).json({ message: "Internal server error" });
        }
    };

    /**
     * GET /merchant/:slugOrId — Get public merchant profile (public).
     */
    getPublicProfile = async (req: AuthRequest, res: Response) => {
        try {
            const { slugOrId } = req.params;
            let profile = await AppDataSource.getRepository(MerchantProfile).findOne({
                where: { slug: slugOrId },
                relations: { user: true },
            });
            if (!profile) {
                profile = await AppDataSource.getRepository(MerchantProfile).findOne({
                    where: { id: slugOrId },
                    relations: { user: true },
                });
            }

            if (!profile) return res.status(404).json({ message: "Merchant not found" });

            const stats = await this.merchantService.getStats(profile.userId);

            return res.status(200).json({
                ...profile,
                storeLink: `https://velocouriersvc.com/store/${profile.slug || profile.id}`,
                stats,
            });
        } catch (error) {
            log.error("Error fetching public profile", { error: (error as Error).message });
            return res.status(500).json({ message: "Internal server error" });
        }
    };
}
