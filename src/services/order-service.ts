import { FindOptionsWhere } from "typeorm";
import { AppDataSource } from "../db/data-source";
import { Order, OrderStatus, OrderPaymentMethod, OrderPaymentStatus, DeliveryType, OrderCancelledBy } from "../models/order";
import { OrderStatusHistory } from "../models/order-status-history";
import { Cart } from "../models/cart";
import { CartItem } from "../models/cart-item";
import { Product } from "../models/product";
import { User } from "../models/user";
import { PlatformSettings } from "../models/platform-settings";
import { MerchantProfile } from "../models/merchant-profile";
import { MerchantStats } from "../models/merchant-stats";
import { WalletService } from "./wallet-service";
import { PromoCode, PromoApplicableTo } from "../models/promo-code";
import { CartService } from "./cart-service";
import { ProductService } from "./product-service";
import { DeliveryFeeService, DeliveryFeeResult } from "./delivery-fee-service";
import { PickupCodeService } from "./pickup-code-service";
import { PaymentService } from "./payment/payment-service";
import { NotificationService } from "./notification-service";
import { NotificationType } from "../models/notification";
import { PaymentRecordStatus } from "../models/payment";
import { redis } from "../utils/redis";
import { createServiceLogger } from "../utils/logger";
import { orderEventsTotal, cartEventsTotal } from "../utils/metrics";
import { formatCurrency } from "../utils/currency";
import { emitOrderEvent } from "../socket-gateway";
import { v4 as uuidv4 } from "uuid";
import { In, LessThan } from "typeorm";

const log = createServiceLogger("OrderService");

// Redis keys
const ORDER_LOCK_KEY = (orderId: string) => `order:lock:${orderId}`;
const ORDER_LOCK_TTL = 30; // seconds

// ── Input Types ─────────────────────────────────────────────────────

export interface OrderQuoteInput {
    deliveryType: DeliveryType;
    deliveryLat?: number;
    deliveryLng?: number;
    deliveryAddress?: string;
    promoCode?: string;
}

export interface OrderQuoteResult {
    subtotal: number;
    serviceFee: number;
    smallOrderFee: number;
    commission: number;
    deliveryFee: number;
    tax: number;
    discount: number;
    totalAmount: number;
    merchantEarnings: number;
    currency: string;
    estimatedDeliveryMin: number | null;
    promoApplied: boolean;
    promoCodeId: string | null;
}

export interface CheckoutInput {
    deliveryType: DeliveryType;
    deliveryAddress?: string;
    deliveryLat?: number;
    deliveryLng?: number;
    paymentMethod: OrderPaymentMethod;
    promoCode?: string;
    customerNote?: string;
    phoneNumber?: string;
    /** Opt-in delivery PIN (off by default). */
    requireDeliveryCode?: boolean;
}

export interface CheckoutResult {
    order: Order;
    payment: {
        reference: string;
        authorizationUrl?: string;
        clientSecret?: string;
        status: string;
    } | null;
}

// ── Service ─────────────────────────────────────────────────────────

export class OrderService {
    private orderRepo = AppDataSource.getRepository(Order);
    private historyRepo = AppDataSource.getRepository(OrderStatusHistory);
    private userRepo = AppDataSource.getRepository(User);
    private settingsRepo = AppDataSource.getRepository(PlatformSettings);
    private merchantRepo = AppDataSource.getRepository(MerchantProfile);
    private promoRepo = AppDataSource.getRepository(PromoCode);
    private statsRepo = AppDataSource.getRepository(MerchantStats);
    private walletService = new WalletService();

    private cartService = new CartService();
    private productService = new ProductService();
    private deliveryFeeService = new DeliveryFeeService();
    private pickupCodeService = new PickupCodeService();
    private paymentService = new PaymentService();
    private notificationService = new NotificationService();

    // ── Quote ───────────────────────────────────────────────────────

    /**
     * Generate a price breakdown (quote) for the user's current cart.
     * Does NOT create an order - just returns what checkout would cost.
     */
    async getQuote(userId: string, input: OrderQuoteInput): Promise<OrderQuoteResult> {
        // 1. Load cart
        const cart = await this.cartService.getCartForCheckout(userId);
        if (!cart || !cart.items || cart.items.length === 0) {
            throw new Error("Cart is empty");
        }

        if (!cart.merchantId) {
            throw new Error("Cart has no merchant");
        }

        // 2. Get user & resolve country/currency
        const user = await this.userRepo.findOne({ where: { id: userId } });
        if (!user) throw new Error("User not found");

        const country = user.country || "GH";
        const settings = await this.getSettings(country);
        const currency = settings?.currency || "GHS";

        // 3. Calculate subtotal from cart items
        const subtotal = cart.items.reduce((sum, item) => sum + Number(item.itemTotal), 0);

        // 4. Check minimum order value
        const mov = settings ? Number(settings.minimumOrderValue) : 0;
        if (subtotal < mov) {
            throw new Error(
                JSON.stringify({
                    type: "BELOW_MOV",
                    message: `Add ${formatCurrency(mov - subtotal, currency)} more to place your order`,
                    minimumOrderValue: mov,
                    currentSubtotal: subtotal,
                    remainingAmount: Math.round((mov - subtotal) * 100) / 100,
                })
            );
        }

        // 5. Get merchant rates (override or platform default)
        const merchant = await this.merchantRepo.findOne({
            where: { userId: cart.merchantId },
        });
        const commissionRate = this.getRate(merchant?.commissionRate, settings?.serviceCommissionRate, 15) / 100;
        const serviceFeeRate = this.getRate(merchant?.serviceFeeRate, settings?.defaultServiceFeeRate, 5) / 100;

        // 6. Calculate fees
        const commission = Math.round(subtotal * commissionRate * 100) / 100;
        let serviceFee = Math.round(subtotal * serviceFeeRate * 100) / 100;

        // Cap service fee
        const serviceFeeMaxCap = settings ? Number(settings.serviceFeeMaxCap) : 4.99;
        if (serviceFeeMaxCap > 0 && serviceFee > serviceFeeMaxCap) {
            serviceFee = serviceFeeMaxCap;
        }

        // Small order fee
        const smallOrderThreshold = settings ? Number(settings.smallOrderThreshold) : 15;
        const smallOrderFeeAmount = settings ? Number(settings.smallOrderFee) : 2.99;
        const smallOrderFee = subtotal < smallOrderThreshold
            ? Math.round(smallOrderFeeAmount * 100) / 100
            : 0;

        // 7. Delivery fee (only for delivery type)
        let deliveryFee = 0;
        let estimatedDeliveryMin: number | null = null;

        if (input.deliveryType === DeliveryType.DELIVERY) {
            if (!input.deliveryLat || !input.deliveryLng) {
                throw new Error("Delivery latitude and longitude are required for delivery orders");
            }

            // A delivery-fee failure must never wipe the rest of the quote (subtotal,
            // service fee, total). If it fails for any reason, fall back to a 0 fee and
            // keep the quote usable; the failure is logged for follow-up.
            try {
                const feeResult = await this.deliveryFeeService.calculateDeliveryFee(
                    cart.merchantId,
                    input.deliveryLat,
                    input.deliveryLng,
                    country
                );
                deliveryFee = feeResult.deliveryFee;
                estimatedDeliveryMin = feeResult.estimatedDeliveryMin;
            } catch (err) {
                log.warn("Delivery fee calculation failed; defaulting to 0", {
                    merchantId: cart.merchantId,
                    error: (err as Error).message,
                });
                deliveryFee = 0;
            }
        }

        // 8. Promo code discount
        let discount = 0;
        let promoApplied = false;
        let promoCodeId: string | null = null;

        if (input.promoCode) {
            const promoResult = await this.applyPromoCode(
                input.promoCode,
                subtotal,
                cart.merchantId
            );
            if (promoResult) {
                discount = promoResult.discount;
                promoApplied = true;
                promoCodeId = promoResult.promoCodeId;
            }
        }

        // 9. Local sales tax on the (discounted) subtotal
        const taxRate = settings ? Number(settings.taxRate) || 0 : 0;
        const tax = Math.round((subtotal - discount) * (taxRate / 100) * 100) / 100;

        // 10. Total & merchant earnings
        const totalAmount = Math.round((subtotal + serviceFee + smallOrderFee + deliveryFee + tax - discount) * 100) / 100;
        const merchantEarnings = Math.round((subtotal - commission) * 100) / 100;

        return {
            subtotal: Math.round(subtotal * 100) / 100,
            serviceFee,
            smallOrderFee,
            commission,
            deliveryFee,
            tax,
            discount,
            totalAmount,
            merchantEarnings,
            currency,
            estimatedDeliveryMin,
            promoApplied,
            promoCodeId,
        };
    }

    // ── Checkout ─────────────────────────────────────────────────────

    /**
     * Checkout - create an order from the user's cart.
     *
     * Flow:
     *  1. Validate cart, stock, MOV
     *  2. Generate quote (fees, promo)
     *  3. Decrement stock
     *  4. Create order + status history
     *  5. Process payment
     *  6. Clear cart
     *  7. Notify merchant
     *  8. Return order + payment info
     */
    async checkout(userId: string, input: CheckoutInput): Promise<CheckoutResult> {
        // Product orders must be paid before dispatch: only prepaid gateway
        // methods are accepted (no cash on delivery, no wallet).
        if (input.paymentMethod === OrderPaymentMethod.CASH || input.paymentMethod === OrderPaymentMethod.WALLET) {
            throw new Error("Orders must be paid online (card or mobile money) before dispatch.");
        }

        // 1. Load cart
        const cart = await this.cartService.getCartForCheckout(userId);
        if (!cart || !cart.items || cart.items.length === 0) {
            throw new Error("Cart is empty");
        }

        if (!cart.merchantId) {
            throw new Error("Cart has no merchant");
        }

        // 2. Get quote (validates MOV, calculates fees)
        const quote = await this.getQuote(userId, {
            deliveryType: input.deliveryType,
            deliveryLat: input.deliveryLat,
            deliveryLng: input.deliveryLng,
            deliveryAddress: input.deliveryAddress,
            promoCode: input.promoCode,
        });

        // 3. Validate delivery fields
        if (input.deliveryType === DeliveryType.DELIVERY) {
            if (!input.deliveryAddress || !input.deliveryLat || !input.deliveryLng) {
                throw new Error("Delivery address, latitude, and longitude are required for delivery orders");
            }
        }

        // 4. Decrement stock (fail fast if out of stock) - per variant when set
        const stockItems = cart.items.map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
            variantId: (item as any).variantId || null,
        }));

        const stockResult = await this.productService.decrementStock(stockItems);
        if (!stockResult.success) {
            // Load product names for the error message
            const outOfStockProducts = await AppDataSource.getRepository(Product).find({
                where: { id: In(stockResult.outOfStock || []) },
                select: ["id", "name", "stockQuantity"],
            });

            const names = outOfStockProducts.map(
                (p) => `"${p.name}" (available: ${p.stockQuantity})`
            );

            throw new Error(`Out of stock: ${names.join(", ")}`);
        }

        try {
            // 5. Build items snapshot (frozen at checkout time)
            const itemsSnapshot = cart.items.map((item) => ({
                productId: item.productId,
                productName: item.product?.name || "Unknown",
                productImage: item.product?.images?.[0] || null,
                quantity: item.quantity,
                unitPrice: Number(item.unitPrice),
                selectedOptions: item.selectedOptions,
                itemTotal: Number(item.itemTotal),
                variantId: (item as any).variantId || null,
                variantLabel: (item as any).variantLabel || null,
                instructions: (item as any).instructions || null,
            }));

            // 6. Generate order number
            const orderNumber = this.generateOrderNumber();

            // 7. Get currency
            const user = await this.userRepo.findOne({ where: { id: userId } });
            const country = user?.country || "GH";
            const settings = await this.getSettings(country);
            const currency = settings?.currency || "GHS";

            // 8. Generate pickup and delivery codes. The delivery PIN is opt-in at
            // checkout (like ride pickup codes); the merchant pickup code stays as-is.
            let pickupCode: string | null = null;
            let deliveryCode: string | null = null;
            if (input.deliveryType === DeliveryType.PICKUP || input.deliveryType === DeliveryType.DELIVERY) {
                pickupCode = this.pickupCodeService.generate();
            }
            const requireDeliveryCode = !!input.requireDeliveryCode;
            if (input.deliveryType === DeliveryType.DELIVERY && requireDeliveryCode) {
                deliveryCode = this.pickupCodeService.generate();
            }

            // 9. Create order
            const order = this.orderRepo.create({
                orderNumber,
                customerId: userId,
                merchantId: cart.merchantId,
                driverId: null,
                items: itemsSnapshot,
                currency,
                subtotal: quote.subtotal,
                serviceFee: quote.serviceFee,
                smallOrderFee: quote.smallOrderFee,
                commission: quote.commission,
                deliveryFee: quote.deliveryFee,
                discountAmount: quote.discount,
                totalAmount: quote.totalAmount,
                merchantEarnings: quote.merchantEarnings,
                paymentMethod: input.paymentMethod,
                paymentStatus: OrderPaymentStatus.PENDING,
                paymentReference: null,
                deliveryType: input.deliveryType,
                deliveryAddress: input.deliveryAddress || null,
                deliveryLat: input.deliveryLat || null,
                deliveryLng: input.deliveryLng || null,
                pickupCode,
                deliveryCode,
                requireDeliveryCode,
                pickupCodeVerifiedAt: null,
                deliveryCodeVerifiedAt: null,
                status: OrderStatus.PENDING,
                cancelledBy: null,
                cancellationReason: null,
                promoCodeId: quote.promoCodeId,
                customerNote: input.customerNote || null,
                merchantNote: null,
            });

            const savedOrder = await this.orderRepo.save(order);

            // 10. Record initial status
            await this.recordStatusChange(
                savedOrder.id,
                null,
                OrderStatus.PENDING,
                userId,
                "customer",
                "Order placed"
            );

            // 10b. Emit WebSocket event for real-time tracking
            emitOrderEvent(savedOrder.id, "order:status", {
                orderId: savedOrder.id,
                status: OrderStatus.PENDING,
                updatedAt: new Date().toISOString(),
            });

            // 11. Increment promo usage
            if (quote.promoCodeId) {
                await this.promoRepo.increment(
                    { id: quote.promoCodeId },
                    "usedCount",
                    1
                );
            }

            // 12. Process payment (orders are always prepaid via the gateway)
            let paymentResult = null;
            {
                try {
                    const pmtResult = await this.paymentService.processOrderPayment({
                        orderId: savedOrder.id,
                        userId,
                        amount: quote.totalAmount,
                        subtotal: quote.subtotal,
                        serviceFee: quote.serviceFee,
                        smallOrderFee: quote.smallOrderFee,
                        deliveryFee: quote.deliveryFee,
                        method: input.paymentMethod as any,
                        country,
                        phoneNumber: input.phoneNumber || user?.phoneNumber || undefined,
                        email: user?.email || undefined,
                    });

                    // ── Gate: if payment initiation failed, roll back ──
                    if (!pmtResult.success) {
                        log.error("Payment initiation failed during checkout, rolling back order", {
                            orderId: savedOrder.id,
                            paymentId: pmtResult.paymentId,
                            paymentStatus: pmtResult.status,
                            message: pmtResult.message,
                        });
                        await this.productService.restoreStock(stockItems);
                        await this.historyRepo.delete({ orderId: savedOrder.id });
                        await this.orderRepo.delete(savedOrder.id);
                        throw new Error(
                            `Payment failed: ${pmtResult.message || "Could not initiate payment. Please try again."}`
                        );
                    }

                    paymentResult = {
                        reference: pmtResult.reference,
                        authorizationUrl: pmtResult.authorizationUrl,
                        clientSecret: pmtResult.clientSecret,
                        status: pmtResult.status,
                    };

                    // Update payment reference on order
                    savedOrder.paymentReference = pmtResult.reference;
                    if (pmtResult.status === PaymentRecordStatus.SUCCESS) {
                        savedOrder.paymentStatus = OrderPaymentStatus.PAID;
                    }
                    await this.orderRepo.save(savedOrder);
                } catch (payError) {
                    // Payment failed - restore stock, delete order (if not already rolled back above)
                    if (!(payError as Error).message.startsWith("Payment failed")) {
                        log.error("Payment threw during checkout, restoring stock", {
                            orderId: savedOrder.id,
                            error: (payError as Error).message,
                        });
                        await this.productService.restoreStock(stockItems);
                        await this.historyRepo.delete({ orderId: savedOrder.id });
                        await this.orderRepo.delete(savedOrder.id);
                    }
                    throw payError instanceof Error ? payError : new Error(`Payment failed: ${payError}`);
                }
            }

            // 13. Clear cart
            await this.cartService.clearCart(userId);
            cartEventsTotal.inc({ action: "checkout" });

            // 14. Notify merchant of new order (in-app). The seller decides when the
            // order is accepted, prepared and ready; nothing auto-advances here.
            await this.notificationService.notify(
                cart.merchantId,
                NotificationType.ORDER_PLACED,
                "New Order! 🛒",
                `Order #${orderNumber} - ${formatCurrency(quote.totalAmount, currency)} (${cart.items.length} item${cart.items.length > 1 ? "s" : ""})`,
                {
                    orderId: savedOrder.id,
                    orderNumber,
                    totalAmount: quote.totalAmount,
                    deliveryType: input.deliveryType,
                }
            );

            // 14b. Also alert the merchant by SMS so they see new orders even when the
            // app is closed (sellers must accept and decide readiness). Best-effort.
            try {
                const merchantUser = await this.userRepo.findOne({ where: { id: cart.merchantId } });
                if (merchantUser?.phoneNumber) {
                    await this.notificationService.notifyBySms(
                        merchantUser.phoneNumber,
                        `New VeloHUB order #${orderNumber} (${formatCurrency(quote.totalAmount, currency)}). Open the app to accept and prepare it.`
                    );
                }
            } catch (smsErr) {
                log.warn("Merchant new-order SMS failed (non-fatal)", { error: (smsErr as Error).message });
            }

            // 15. Notify customer - order placed confirmation
            await this.notificationService.notify(
                userId,
                NotificationType.ORDER_PLACED,
                "Order Placed! 🛍️",
                `Your order #${orderNumber} has been placed and is awaiting confirmation from the merchant.`,
                {
                    orderId: savedOrder.id,
                    orderNumber,
                    totalAmount: quote.totalAmount,
                    deliveryType: input.deliveryType,
                }
            );

            // 16. Notify customer with pickup or delivery codes
            if (pickupCode) {
                const codeMessage = input.deliveryType === DeliveryType.DELIVERY && deliveryCode
                    ? `Order #${orderNumber} placed! Pickup code: ${pickupCode}. Delivery code: ${deliveryCode}. Show pickup code to the merchant and give the delivery code to your driver on arrival.`
                    : `Order #${orderNumber} placed! Your pickup code is: ${pickupCode}`;

                await this.notificationService.notify(
                    userId,
                    NotificationType.PICKUP_CODE_GENERATED,
                    deliveryCode ? "Your Delivery Codes 🔐" : "Your Pickup Code 📦",
                    codeMessage,
                    {
                        orderId: savedOrder.id,
                        orderNumber,
                        pickupCode,
                        deliveryCode: deliveryCode || null,
                    }
                );
            }

            // 16. Metrics
            orderEventsTotal.inc({
                status: OrderStatus.PENDING,
                type: input.deliveryType,
            });

            log.info("Order created", {
                orderId: savedOrder.id,
                orderNumber,
                customerId: userId,
                merchantId: cart.merchantId,
                totalAmount: quote.totalAmount,
                paymentMethod: input.paymentMethod,
                deliveryType: input.deliveryType,
            });

            return {
                order: savedOrder,
                payment: paymentResult,
            };
        } catch (error) {
            // If order creation fails after stock decrement, restore stock
            if (!(error as Error).message.startsWith("Payment failed")) {
                await this.productService.restoreStock(stockItems);
            }
            throw error;
        }
    }

    // ── Customer Order Queries ───────────────────────────────────────

    /**
     * Get customer's active/ongoing order (not completed or cancelled).
     */
    async getActiveOrder(customerId: string): Promise<Order | null> {
        const activeStatuses = [
            OrderStatus.PENDING,
            OrderStatus.ACCEPTED,
            OrderStatus.PREPARING,
            OrderStatus.READY_FOR_PICKUP,
            OrderStatus.READY_FOR_DELIVERY,
            OrderStatus.DRIVER_ASSIGNED,
            OrderStatus.PICKED_UP,
            OrderStatus.IN_TRANSIT,
        ];

        return this.orderRepo.findOne({
            where: activeStatuses.map((status) => ({ customerId, status })),
            relations: {
                merchant: { merchantProfile: true },
                driver: { driverProfile: true },
                statusHistory: true,
            },
            order: { createdAt: "DESC" },
        });
    }

    /**
     * Get customer's orders with pagination.
     */
    async getCustomerOrders(
        customerId: string,
        params: {
            status?: OrderStatus;
            page?: number;
            limit?: number;
        }
    ): Promise<{ orders: Order[]; total: number; page: number; limit: number }> {
        const page = params.page || 1;
        const limit = Math.min(params.limit || 20, 50);
        const offset = (page - 1) * limit;

        const where: FindOptionsWhere<Order> = { customerId };
        if (params.status) where.status = params.status;

        const [orders, total] = await this.orderRepo.findAndCount({
            where,
            order: { createdAt: "DESC" },
            skip: offset,
            take: limit,
        });

        return { orders, total, page, limit };
    }

    /**
     * Get a single order with full details (items, status history, merchant info).
     */
    async getOrderById(orderId: string, userId: string): Promise<Order | null> {
        const order = await this.orderRepo.findOne({
            where: { id: orderId },
            relations: {
                customer: true,
                merchant: { merchantProfile: true },
                driver: true,
                statusHistory: true,
            },
        });

        if (!order) return null;

        // Only allow the customer, merchant, driver, or admin to view
        if (
            order.customerId !== userId &&
            order.merchantId !== userId &&
            order.driverId !== userId
        ) {
            throw new Error("You do not have access to this order");
        }

        return order;
    }

    // ── Customer Cancel ─────────────────────────────────────────────

    /**
     * Customer cancels their own order.
     * Only allowed in PENDING or ACCEPTED status.
     */
    async cancelOrder(
        orderId: string,
        customerId: string,
        reason?: string
    ): Promise<Order> {
        const order = await this.orderRepo.findOne({
            where: { id: orderId, customerId },
        });

        if (!order) throw new Error("Order not found");

        // A customer may cancel any time *before the goods leave the merchant* -
        // i.e. before the order is picked up / in transit / delivered. This covers
        // in-progress orders (preparing, ready, driver-assigned), not just brand-new ones.
        const cancellableStatuses = [
            OrderStatus.PENDING,
            OrderStatus.ACCEPTED,
            OrderStatus.PREPARING,
            OrderStatus.READY_FOR_PICKUP,
            OrderStatus.READY_FOR_DELIVERY,
            OrderStatus.DRIVER_ASSIGNED,
        ];
        if (!cancellableStatuses.includes(order.status)) {
            throw new Error(
                `Cannot cancel order in "${order.status}" status. Orders can only be cancelled before they are picked up.`
            );
        }

        const fromStatus = order.status;
        const assignedDriverId = order.driverId;
        const resolvedReason = reason || "Cancelled by customer";

        // If payment was already captured, cancelling creates a refund obligation.
        const refundDue =
            order.paymentStatus === OrderPaymentStatus.PAID ||
            order.paymentStatus === OrderPaymentStatus.ESCROWED;

        order.status = OrderStatus.CANCELLED;
        order.cancelledBy = OrderCancelledBy.CUSTOMER;
        order.cancellationReason = resolvedReason;
        order.cancelledAt = new Date();
        order.driverId = null; // release any assigned driver back to the pool

        await this.orderRepo.save(order);
        await this.recordStatusChange(
            orderId,
            fromStatus,
            OrderStatus.CANCELLED,
            customerId,
            "customer",
            resolvedReason
        );

        // Emit WebSocket event for real-time tracking
        emitOrderEvent(orderId, "order:status", {
            orderId,
            status: OrderStatus.CANCELLED,
            updatedAt: new Date().toISOString(),
        });

        // Restore stock
        const stockItems = (order.items || []).map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
            variantId: (item as any).variantId || null,
        }));
        if (stockItems.length > 0) {
            await this.productService.restoreStock(stockItems);
        }

        // Notify merchant
        await this.notificationService.notify(
            order.merchantId,
            NotificationType.ORDER_CANCELLED,
            "Order Cancelled ❌",
            `Order #${order.orderNumber} was cancelled by the customer${reason ? `: ${reason}` : ""}.`,
            { orderId, status: OrderStatus.CANCELLED }
        );

        // Release & notify the assigned driver, if any, so they stop heading to pickup.
        if (assignedDriverId) {
            await this.notificationService.notify(
                assignedDriverId,
                NotificationType.ORDER_CANCELLED,
                "Delivery Cancelled ❌",
                `Order #${order.orderNumber} was cancelled by the customer. You can pick up another delivery.`,
                { orderId, status: OrderStatus.CANCELLED }
            );
        }

        // Refund handling. There is no automated refund integration yet, so we record
        // the obligation, keep the captured paymentStatus for finance reconciliation,
        // and let the customer know a refund is being processed.
        if (refundDue) {
            log.warn("Paid order cancelled - refund due, requires reconciliation", {
                orderId,
                orderNumber: order.orderNumber,
                amount: order.totalAmount,
                paymentMethod: order.paymentMethod,
                paymentReference: order.paymentReference,
            });
            await this.notificationService.notify(
                customerId,
                NotificationType.ORDER_CANCELLED,
                "Refund on the way 💸",
                `Your order #${order.orderNumber} was cancelled. Your payment will be refunded to your original payment method.`,
                { orderId, status: OrderStatus.CANCELLED, refundDue: true }
            );
        }

        orderEventsTotal.inc({ status: "cancelled", type: order.deliveryType });
        log.info("Order cancelled by customer", {
            orderId,
            customerId,
            reason: resolvedReason,
            fromStatus,
            driverReleased: Boolean(assignedDriverId),
            refundDue,
        });

        return order;
    }

    /**
     * Auto-cancel orders the merchant never accepted within the SLA window.
     * Refunds paid customers to their wallet, restores stock, logs a merchant
     * penalty, and notifies both sides. Returns the count cancelled.
     */
    async autoCancelStaleOrders(maxAgeMinutes = 10): Promise<number> {
        const cutoff = new Date(Date.now() - maxAgeMinutes * 60 * 1000);
        const stale = await this.orderRepo.find({
            where: { status: OrderStatus.PENDING, createdAt: LessThan(cutoff) },
            take: 50,
        });

        let cancelled = 0;
        for (const order of stale) {
            try {
                const refundDue = order.paymentStatus === OrderPaymentStatus.PAID
                    || order.paymentStatus === OrderPaymentStatus.ESCROWED;

                order.status = OrderStatus.CANCELLED;
                order.cancelledBy = OrderCancelledBy.SYSTEM;
                order.cancellationReason = "Merchant did not respond in time";
                order.cancelledAt = new Date();
                if (refundDue) order.paymentStatus = OrderPaymentStatus.REFUNDED;
                await this.orderRepo.save(order);
                await this.recordStatusChange(order.id, OrderStatus.PENDING, OrderStatus.CANCELLED, "system", "system", "Auto-cancelled (merchant timeout)");
                emitOrderEvent(order.id, "order:status", { orderId: order.id, status: OrderStatus.CANCELLED, updatedAt: new Date().toISOString() });

                // Restore stock
                const stockItems = (order.items || []).map((i) => ({ productId: i.productId, quantity: i.quantity, variantId: (i as any).variantId || null }));
                if (stockItems.length > 0) await this.productService.restoreStock(stockItems);

                // Refund to wallet
                if (refundDue) {
                    await this.walletService.credit(
                        order.customerId, Number(order.totalAmount),
                        `Refund: order #${order.orderNumber} auto-cancelled`,
                        { orderId: order.id, reason: "merchant_timeout" }
                    ).catch((e) => log.warn("Auto-cancel refund failed", { orderId: order.id, error: e.message }));
                }

                // Merchant penalty counter
                await this.statsRepo.increment({ merchantId: order.merchantId }, "autoCancelledOrders", 1)
                    .catch(() => {});

                await this.notificationService.notify(order.customerId, NotificationType.ORDER_CANCELLED, "Order cancelled",
                    `Order #${order.orderNumber} was auto-cancelled because the merchant did not respond.${refundDue ? " You have been refunded to your wallet." : ""}`,
                    { orderId: order.id });
                await this.notificationService.notify(order.merchantId, NotificationType.ORDER_CANCELLED, "Order missed",
                    `Order #${order.orderNumber} was auto-cancelled after no response. This affects your performance.`,
                    { orderId: order.id });

                cancelled++;
            } catch (err) {
                log.warn("Auto-cancel failed for an order", { orderId: order.id, error: (err as Error).message });
            }
        }
        return cancelled;
    }

    // ── Helpers ──────────────────────────────────────────────────────

    /**
     * Generate a human-readable order number: "ORD-XXXXXX"
     * Uses 6 uppercase alphanumeric characters.
     */
    private generateOrderNumber(): string {
        const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
        let code = "";
        for (let i = 0; i < 6; i++) {
            code += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return `ORD-${code}`;
    }

    /**
     * Apply a promo code and return the discount amount.
     * Returns null if code is invalid/expired/not applicable.
     */
    private async applyPromoCode(
        code: string,
        subtotal: number,
        merchantId: string
    ): Promise<{ discount: number; promoCodeId: string } | null> {
        const promo = await this.promoRepo.findOne({
            where: { code: code.toUpperCase(), isActive: true },
        });

        if (!promo) return null;

        // Check expiry
        if (promo.expiryDate && new Date(promo.expiryDate) < new Date()) {
            return null;
        }

        // Check usage limit
        if (promo.usageLimit && promo.usedCount >= promo.usageLimit) {
            return null;
        }

        // Check applicability (must be for orders or both)
        if (promo.applicableTo === PromoApplicableTo.RIDES) {
            return null;
        }

        // Check merchant restriction
        if (promo.merchantId && promo.merchantId !== merchantId) {
            return null;
        }

        // Check minimum order value
        if (promo.minOrderValue && subtotal < Number(promo.minOrderValue)) {
            return null;
        }

        // Calculate discount
        let discount = 0;
        if (promo.discountType === "fixed") {
            discount = Number(promo.discountValue);
        } else {
            // Default to percentage
            discount = Math.round(subtotal * (Number(promo.discountValue || promo.discountPercent) / 100) * 100) / 100;
        }

        // Apply max discount cap
        if (promo.maxDiscountAmt) {
            discount = Math.min(discount, Number(promo.maxDiscountAmt));
        }

        // Ensure discount doesn't exceed subtotal
        discount = Math.min(discount, subtotal);

        return { discount, promoCodeId: promo.id };
    }

    /**
     * Get platform settings for a country.
     */
    private async getSettings(country: string): Promise<PlatformSettings | null> {
        return this.settingsRepo.findOne({
            where: { country, isActive: true },
        });
    }

    /**
     * Get the effective rate - merchant override > platform default > fallback.
     */
    private getRate(
        merchantOverride: number | null | undefined,
        platformDefault: number | undefined,
        fallback: number
    ): number {
        if (merchantOverride !== null && merchantOverride !== undefined) {
            return Number(merchantOverride);
        }
        if (platformDefault !== undefined) {
            return Number(platformDefault);
        }
        return fallback;
    }

    /**
     * Record an order status change in the history table.
     */
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

    /**
     * Acquire a distributed lock for an order (prevents double-accept, etc.).
     */
    async acquireLock(orderId: string): Promise<boolean> {
        const result = await redis.set(
            ORDER_LOCK_KEY(orderId),
            "locked",
            "EX",
            ORDER_LOCK_TTL,
            "NX"
        );
        return result === "OK";
    }

    /**
     * Release the distributed lock for an order.
     */
    async releaseLock(orderId: string): Promise<void> {
        await redis.del(ORDER_LOCK_KEY(orderId));
    }
}
