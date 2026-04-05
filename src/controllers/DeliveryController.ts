import { Response } from "express";
import { AuthRequest } from "../middleware/role-middleware";
import { DeliveryService } from "../services/delivery-service";
import { OrderStatus } from "../models/order";
import { createServiceLogger } from "../utils/logger";

const log = createServiceLogger("DeliveryController");

export class DeliveryController {
    private deliveryService = new DeliveryService();

    // ── Available Deliveries ────────────────────────────────────────

    /**
     * GET /driver/deliveries/available
     * List marketplace orders waiting for a driver.
     */
    getAvailableDeliveries = async (req: AuthRequest, res: Response) => {
        try {
            const driverId = req.user?.id;
            if (!driverId) return res.status(401).json({ message: "User ID required" });

            const lat = req.query.lat ? Number(req.query.lat) : undefined;
            const lng = req.query.lng ? Number(req.query.lng) : undefined;
            const radiusKm = req.query.radiusKm ? Number(req.query.radiusKm) : undefined;

            const deliveries = await this.deliveryService.getAvailableDeliveries(driverId, {
                lat,
                lng,
                radiusKm,
            });

            return res.status(200).json({ deliveries, total: deliveries.length });
        } catch (error) {
            log.error("Error getting available deliveries", { error: (error as Error).message });
            return res.status(500).json({ message: "Internal server error" });
        }
    };

    // ── Accept Delivery ─────────────────────────────────────────────

    /**
     * POST /driver/deliveries/:orderId/accept
     * Accept a marketplace delivery order.
     */
    acceptDelivery = async (req: AuthRequest, res: Response) => {
        try {
            const driverId = req.user?.id;
            if (!driverId) return res.status(401).json({ message: "User ID required" });

            const { orderId } = req.params;
            if (!orderId) return res.status(400).json({ message: "orderId is required" });

            const order = await this.deliveryService.acceptDelivery(driverId, orderId);

            return res.status(200).json({
                message: "Delivery accepted",
                order: {
                    id: order.id,
                    orderNumber: order.orderNumber,
                    status: order.status,
                    merchantId: order.merchantId,
                    deliveryAddress: order.deliveryAddress,
                    deliveryLat: order.deliveryLat,
                    deliveryLng: order.deliveryLng,
                    totalAmount: order.totalAmount,
                    deliveryFee: order.deliveryFee,
                },
            });
        } catch (error) {
            const message = (error as Error).message;

            if (message.includes("already been accepted") || message.includes("not available")) {
                return res.status(409).json({ message });
            }
            if (message.includes("not found")) {
                return res.status(404).json({ message });
            }

            log.error("Error accepting delivery", { error: message });
            return res.status(500).json({ message: "Internal server error" });
        }
    };

    // ── Update Delivery Status ──────────────────────────────────────

    /**
     * PATCH /driver/deliveries/:orderId/status
     * Transition delivery status: PICKED_UP → IN_TRANSIT → DELIVERED
     */
    updateDeliveryStatus = async (req: AuthRequest, res: Response) => {
        try {
            const driverId = req.user?.id;
            if (!driverId) return res.status(401).json({ message: "User ID required" });

            const { orderId } = req.params;
            const { status } = req.body;

            if (!orderId) return res.status(400).json({ message: "orderId is required" });

            const validStatuses = [OrderStatus.PICKED_UP, OrderStatus.IN_TRANSIT, OrderStatus.DELIVERED];
            if (!status || !validStatuses.includes(status)) {
                return res.status(400).json({
                    message: `status is required. Must be one of: ${validStatuses.join(", ")}`,
                });
            }

            const order = await this.deliveryService.updateDeliveryStatus(driverId, orderId, status);

            return res.status(200).json({
                message: `Delivery status updated to ${status}`,
                order: {
                    id: order.id,
                    orderNumber: order.orderNumber,
                    status: order.status,
                    pickedUpAt: order.pickedUpAt,
                    deliveredAt: order.deliveredAt,
                },
            });
        } catch (error) {
            const message = (error as Error).message;

            if (message.includes("not assigned") || message.includes("Invalid transition")) {
                return res.status(400).json({ message });
            }
            if (message.includes("not found")) {
                return res.status(404).json({ message });
            }

            log.error("Error updating delivery status", { error: message });
            return res.status(500).json({ message: "Internal server error" });
        }
    };

    /**
     * POST /driver/deliveries/:orderId/cancel
     * Driver cancels their assignment before picking up the order.
     */
    cancelDeliveryAssignment = async (req: AuthRequest, res: Response) => {
        try {
            const driverId = req.user?.id;
            if (!driverId) return res.status(401).json({ message: "User ID required" });
            
            const { orderId } = req.params;
            const { reason } = req.body;
            if (!orderId) return res.status(400).json({ message: "orderId is required" });

            const order = await this.deliveryService.cancelDeliveryAssignment(driverId, orderId, reason);

            return res.status(200).json({
                message: "Delivery assignment cancelled",
                order: {
                    id: order.id,
                    orderNumber: order.orderNumber,
                    status: order.status,
                },
            });
        } catch (error) {
            const message = (error as Error).message;

            if (message.includes("not assigned") || message.includes("Cannot cancel")) {
                return res.status(400).json({ message });
            }
            if (message.includes("not found")) {
                return res.status(404).json({ message });
            }

            log.error("Error cancelling delivery assignment", { error: message });
            return res.status(500).json({ message: "Internal server error" });
        }
    };

    // ── Complete Delivery ────────────────────────────────────────────

    /**
     * POST /driver/deliveries/:orderId/complete
     * Mark delivery as complete and trigger settlement.
     */
    completeDelivery = async (req: AuthRequest, res: Response) => {
        try {
            const driverId = req.user?.id;
            if (!driverId) return res.status(401).json({ message: "User ID required" });

            const { orderId } = req.params;
            if (!orderId) return res.status(400).json({ message: "orderId is required" });

            const result = await this.deliveryService.completeDelivery(driverId, orderId);

            return res.status(200).json({
                message: "Delivery completed and settled",
                order: {
                    id: result.order.id,
                    orderNumber: result.order.orderNumber,
                    status: result.order.status,
                    deliveredAt: result.order.deliveredAt,
                },
                settlement: result.settlement
                    ? {
                          settlementType: result.settlement.settlementType,
                          merchantEarnings: result.settlement.merchantEarnings,
                          driverEarnings: result.settlement.driverEarnings,
                          platformFee: result.settlement.platformFee,
                      }
                    : null,
            });
        } catch (error) {
            const message = (error as Error).message;

            if (message.includes("not assigned") || message.includes("Cannot complete")) {
                return res.status(400).json({ message });
            }
            if (message.includes("not found")) {
                return res.status(404).json({ message });
            }

            log.error("Error completing delivery", { error: message });
            return res.status(500).json({ message: "Internal server error" });
        }
    };

    // ── Active Delivery ─────────────────────────────────────────────

    /**
     * GET /driver/deliveries/active
     * Get driver's current active marketplace delivery.
     */
    getActiveDelivery = async (req: AuthRequest, res: Response) => {
        try {
            const driverId = req.user?.id;
            if (!driverId) return res.status(401).json({ message: "User ID required" });

            const delivery = await this.deliveryService.getActiveDelivery(driverId);

            return res.status(200).json({ delivery });
        } catch (error) {
            log.error("Error getting active delivery", { error: (error as Error).message });
            return res.status(500).json({ message: "Internal server error" });
        }
    };

    // ── Delivery History ────────────────────────────────────────────

    /**
     * GET /driver/deliveries/history
     * Paginated list of completed marketplace deliveries.
     */
    getDeliveryHistory = async (req: AuthRequest, res: Response) => {
        try {
            const driverId = req.user?.id;
            if (!driverId) return res.status(401).json({ message: "User ID required" });

            const page = Number(req.query.page) || 1;
            const limit = Math.min(Number(req.query.limit) || 20, 50);

            const result = await this.deliveryService.getDeliveryHistory(driverId, { page, limit });

            return res.status(200).json(result);
        } catch (error) {
            log.error("Error getting delivery history", { error: (error as Error).message });
            return res.status(500).json({ message: "Internal server error" });
        }
    };
}
