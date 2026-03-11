import { Response } from "express";
import { AuthRequest } from "../middleware/role-middleware";
import { OrderService, OrderQuoteInput, CheckoutInput } from "../services/order-service";
import { DeliveryType, OrderPaymentMethod, OrderStatus } from "../models/order";
import { createServiceLogger } from "../utils/logger";

const log = createServiceLogger("MarketplaceOrderController");

export class MarketplaceOrderController {
    private orderService = new OrderService();

    // ── Quote ───────────────────────────────────────────────────────

    /**
     * POST /orders/quote — Get price breakdown before checkout.
     */
    getQuote = async (req: AuthRequest, res: Response) => {
        try {
            const userId = req.user?.id;
            if (!userId) return res.status(401).json({ message: "User ID required" });

            const { deliveryType, deliveryLat, deliveryLng, deliveryAddress, promoCode } = req.body;

            if (!deliveryType || !Object.values(DeliveryType).includes(deliveryType)) {
                return res.status(400).json({
                    message: `deliveryType is required. Must be one of: ${Object.values(DeliveryType).join(", ")}`,
                });
            }

            if (deliveryType === DeliveryType.DELIVERY) {
                if (!deliveryLat || !deliveryLng) {
                    return res.status(400).json({
                        message: "deliveryLat and deliveryLng are required for delivery orders",
                    });
                }
            }

            const input: OrderQuoteInput = {
                deliveryType,
                deliveryLat: deliveryLat ? Number(deliveryLat) : undefined,
                deliveryLng: deliveryLng ? Number(deliveryLng) : undefined,
                deliveryAddress,
                promoCode,
            };

            const quote = await this.orderService.getQuote(userId, input);
            return res.status(200).json({ quote });
        } catch (error) {
            const message = (error as Error).message;

            // Handle below-MOV structured error
            if (message.startsWith("{")) {
                try {
                    const parsed = JSON.parse(message);
                    if (parsed.type === "BELOW_MOV") {
                        return res.status(400).json({
                            success: false,
                            message: parsed.message,
                            minimumOrderValue: parsed.minimumOrderValue,
                            currentSubtotal: parsed.currentSubtotal,
                            remainingAmount: parsed.remainingAmount,
                        });
                    }
                } catch {
                    // Fall through
                }
            }

            if (message.includes("empty") || message.includes("no merchant")) {
                return res.status(400).json({ message });
            }

            log.error("Error getting quote", { error: message });
            return res.status(500).json({ message: "Internal server error" });
        }
    };

    // ── Checkout ─────────────────────────────────────────────────────

    /**
     * POST /orders/checkout — Place an order from the user's cart.
     */
    checkout = async (req: AuthRequest, res: Response) => {
        try {
            const userId = req.user?.id;
            if (!userId) return res.status(401).json({ message: "User ID required" });

            const {
                deliveryType,
                deliveryAddress,
                deliveryLat,
                deliveryLng,
                paymentMethod,
                promoCode,
                customerNote,
                phoneNumber,
            } = req.body;

            // Validate deliveryType
            if (!deliveryType || !Object.values(DeliveryType).includes(deliveryType)) {
                return res.status(400).json({
                    message: `deliveryType is required. Must be one of: ${Object.values(DeliveryType).join(", ")}`,
                });
            }

            // Validate paymentMethod
            if (!paymentMethod || !Object.values(OrderPaymentMethod).includes(paymentMethod)) {
                return res.status(400).json({
                    message: `paymentMethod is required. Must be one of: ${Object.values(OrderPaymentMethod).join(", ")}`,
                });
            }

            // Validate delivery fields
            if (deliveryType === DeliveryType.DELIVERY) {
                if (!deliveryAddress) {
                    return res.status(400).json({ message: "deliveryAddress is required for delivery orders" });
                }
                if (!deliveryLat || !deliveryLng) {
                    return res.status(400).json({
                        message: "deliveryLat and deliveryLng are required for delivery orders",
                    });
                }
            }

            // Validate phone for momo payments
            if (paymentMethod === OrderPaymentMethod.MOMO && !phoneNumber && !req.user?.phoneNumber) {
                return res.status(400).json({
                    message: "phoneNumber is required for momo payments",
                });
            }

            const input: CheckoutInput = {
                deliveryType,
                deliveryAddress,
                deliveryLat: deliveryLat ? Number(deliveryLat) : undefined,
                deliveryLng: deliveryLng ? Number(deliveryLng) : undefined,
                paymentMethod,
                promoCode,
                customerNote,
                phoneNumber: phoneNumber || req.user?.phoneNumber,
            };

            const result = await this.orderService.checkout(userId, input);

            return res.status(201).json({
                message: "Order placed successfully",
                order: {
                    id: result.order.id,
                    orderNumber: result.order.orderNumber,
                    status: result.order.status,
                    totalAmount: result.order.totalAmount,
                    paymentStatus: result.order.paymentStatus,
                    pickupCode: result.order.pickupCode,
                    deliveryType: result.order.deliveryType,
                    estimatedDeliveryMin: null, // TODO: derive from delivery fee service
                },
                payment: result.payment,
            });
        } catch (error) {
            const message = (error as Error).message;

            // Handle structured MOV error
            if (message.startsWith("{")) {
                try {
                    const parsed = JSON.parse(message);
                    if (parsed.type === "BELOW_MOV") {
                        return res.status(400).json({
                            success: false,
                            message: parsed.message,
                            minimumOrderValue: parsed.minimumOrderValue,
                            currentSubtotal: parsed.currentSubtotal,
                            remainingAmount: parsed.remainingAmount,
                        });
                    }
                } catch {
                    // Fall through
                }
            }

            if (message.includes("empty") || message.includes("no merchant")) {
                return res.status(400).json({ message });
            }
            if (message.includes("Out of stock")) {
                return res.status(409).json({ message });
            }
            if (message.includes("Payment failed")) {
                return res.status(402).json({ message });
            }

            log.error("Error during checkout", { error: message });
            return res.status(500).json({ message: "Internal server error" });
        }
    };

    // ── My Orders ───────────────────────────────────────────────────

    /**
     * GET /orders — Get customer's orders.
     */
    getMyOrders = async (req: AuthRequest, res: Response) => {
        try {
            const userId = req.user?.id;
            if (!userId) return res.status(401).json({ message: "User ID required" });

            const { status, page, limit } = req.query;

            const result = await this.orderService.getCustomerOrders(userId, {
                status: status as OrderStatus | undefined,
                page: page ? Number(page) : undefined,
                limit: limit ? Number(limit) : undefined,
            });

            return res.status(200).json(result);
        } catch (error) {
            log.error("Error getting orders", { error: (error as Error).message });
            return res.status(500).json({ message: "Internal server error" });
        }
    };

    // ── Order Detail ────────────────────────────────────────────────

    /**
     * GET /orders/:id — Get a single order with full details.
     */
    getOrder = async (req: AuthRequest, res: Response) => {
        try {
            const userId = req.user?.id;
            if (!userId) return res.status(401).json({ message: "User ID required" });

            const { id } = req.params;
            const order = await this.orderService.getOrderById(id, userId);

            if (!order) {
                return res.status(404).json({ message: "Order not found" });
            }

            return res.status(200).json({ order });
        } catch (error) {
            const message = (error as Error).message;

            if (message.includes("do not have access")) {
                return res.status(403).json({ message });
            }

            log.error("Error getting order", { error: message });
            return res.status(500).json({ message: "Internal server error" });
        }
    };

    // ── Cancel ──────────────────────────────────────────────────────

    /**
     * POST /orders/:id/cancel — Customer cancels their order.
     */
    cancelOrder = async (req: AuthRequest, res: Response) => {
        try {
            const userId = req.user?.id;
            if (!userId) return res.status(401).json({ message: "User ID required" });

            const { id } = req.params;
            const { reason } = req.body;

            const order = await this.orderService.cancelOrder(id, userId, reason);

            return res.status(200).json({
                message: "Order cancelled",
                order: {
                    id: order.id,
                    orderNumber: order.orderNumber,
                    status: order.status,
                    cancelledBy: order.cancelledBy,
                    cancellationReason: order.cancellationReason,
                },
            });
        } catch (error) {
            const message = (error as Error).message;

            if (message.includes("not found")) {
                return res.status(404).json({ message });
            }
            if (message.includes("Cannot cancel")) {
                return res.status(400).json({ message });
            }

            log.error("Error cancelling order", { error: message });
            return res.status(500).json({ message: "Internal server error" });
        }
    };
}
