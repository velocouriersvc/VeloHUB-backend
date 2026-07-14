import { AppDataSource } from "../db/data-source";
import { MerchantProfile, MerchantVerificationStatus } from "../models/merchant-profile";
import { MerchantStats } from "../models/merchant-stats";
import { MerchantOperatingHours } from "../models/merchant-operating-hours";
import { Order, OrderStatus, OrderPaymentStatus, OrderCancelledBy, DeliveryType } from "../models/order";
import { User } from "../models/user";
import { PickupCodeService } from "./pickup-code-service";
import { OrderStatusHistory } from "../models/order-status-history";
import { WalletService } from "./wallet-service";
import { NotificationService } from "./notification-service";
import { NotificationType } from "../models/notification";
import { createServiceLogger } from "../utils/logger";
import { formatCurrency } from "../utils/currency";
import { emitOrderEvent } from "../socket-gateway";
import { Between, In, FindOptionsWhere } from "typeorm";
import { SettlementResult } from "./settlement-service";
import { WalletTransactionResponse } from "../types/merchant";

const log = createServiceLogger("MerchantService");

// ── Input Types ─────────────────────────────────────────────────────

export interface OperatingHoursInput {
    dayOfWeek: number; // 0=Sunday, 6=Saturday
    openTime: string;  // "HH:MM" or "HH:MM:SS"
    closeTime: string;
    isClosed: boolean;
}

export interface MerchantDashboard {
    profile: MerchantProfile & { storeLink: string };
    stats: MerchantStats | null;
    todayOrders: number;
    pendingOrders: number;
    activeOrders: number;
    completedOrders: number;
    totalSales: number;
    walletBalance: number;
    isOpen: boolean;
}

export interface MerchantFinances {
    walletBalance: number;
    pendingBalance: number;
    lifetimeEarnings: number;
    nextPayoutDate: string | null;
    currencyCode: string;
    payoutLimit: number;
    recentTransactions: WalletTransactionResponse[];
}

// ── Service ─────────────────────────────────────────────────────────

export class MerchantService {
    private profileRepo = AppDataSource.getRepository(MerchantProfile);
    private statsRepo = AppDataSource.getRepository(MerchantStats);
    private hoursRepo = AppDataSource.getRepository(MerchantOperatingHours);
    private orderRepo = AppDataSource.getRepository(Order);
    private historyRepo = AppDataSource.getRepository(OrderStatusHistory);
    private userRepo = AppDataSource.getRepository(User);
    private walletService = new WalletService();
    private notificationService = new NotificationService();

    // ── Profile ─────────────────────────────────────────────────────

    /**
     * Get the merchant profile with comprehensive details for iOS Settings.
     */
    async getProfile(merchantId: string): Promise<any | null> {
        const profile = await this.profileRepo.findOne({
            where: { userId: merchantId },
            relations: { user: true },
        });
        if (!profile) return null;

        // Fetch hours
        const hoursList = await this.hoursRepo.find({ where: { merchantId } });
        const dayNames = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
        const operatingHours: Record<string, any> = {};

        // Initialize all 7 days with defaults
        dayNames.forEach((name, idx) => {
            const h = hoursList.find(item => item.dayOfWeek === idx);
            operatingHours[name] = {
                open: h ? h.openTime : "08:00",
                close: h ? h.closeTime : "20:00",
                isActive: h ? !h.isClosed : (idx !== 0), // Default closed on Sunday
            };
        });

        // Map business type
        const serviceCategories = ["services", "salon", "laundry", "errands", "wellness"];
        const businessType = serviceCategories.includes(profile.category?.toLowerCase() || "") ? "services" : "products";

        return {
            ...profile,
            phoneNumber: profile.businessPhone || profile.user?.phoneNumber, // sync phone
            storeLink: `https://velocouriersvc.com/store/${profile.slug || profile.id}`,
            businessType,
            operatingHours,
            isOnline: profile.isOpen,
        };
    }

    /**
     * Update merchant profile fields - supports behavioral flags and hours dictionary.
     */
    async updateProfile(merchantId: string, input: any): Promise<any> {
        const profile = await this.profileRepo.findOne({ where: { userId: merchantId } });
        if (!profile) throw new Error("Merchant profile not found");

        const { hours, isOnline, ...otherFields } = input;

        // 1. Update basic fields
        if (isOnline !== undefined) profile.isOpen = isOnline;
        Object.assign(profile, otherFields);
        const saved = await this.profileRepo.save(profile);

        // 2. Update hours if provided as dictionary { mon: { open, close, isActive } }
        if (hours) {
            const dayNames = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
            for (const [day, h] of Object.entries(hours) as [string, any][]) {
                const dayIndex = dayNames.indexOf(day.toLowerCase());
                if (dayIndex === -1) continue;

                let hourRecord = await this.hoursRepo.findOne({ where: { merchantId, dayOfWeek: dayIndex } });
                if (!hourRecord) {
                    hourRecord = this.hoursRepo.create({ merchantId, dayOfWeek: dayIndex });
                }

                hourRecord.openTime = h.open || "08:00";
                hourRecord.closeTime = h.close || "20:00";
                hourRecord.isClosed = h.isActive === false;

                await this.hoursRepo.save(hourRecord);
            }
        }

        return this.getProfile(merchantId);
    }

    /**
     * Toggle merchant online status (isOpen).
     */
    async toggleOpen(merchantId: string, isOpen: boolean): Promise<MerchantProfile & { storeLink: string }> {
        const profile = await this.profileRepo.findOne({ where: { userId: merchantId } });
        if (!profile) throw new Error("Merchant profile not found");

        profile.isOpen = isOpen;
        const saved = await this.profileRepo.save(profile);
        log.info("Merchant toggled open status", { merchantId, isOpen });
        return {
            ...saved,
            storeLink: `https://velocouriersvc.com/store/${saved.slug || saved.id}`,
        };
    }

    // ── Dashboard ───────────────────────────────────────────────────

    /**
     * Merchant dashboard - profile + stats + today's snapshot.
     */
    async getDashboard(merchantId: string): Promise<MerchantDashboard> {
        const profile = await this.profileRepo.findOne({
            where: { userId: merchantId },
            relations: { user: true },
        });
        if (!profile) throw new Error("Merchant profile not found");

        const stats = await this.statsRepo.findOne({ where: { merchantId } });

        // Today's orders
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const todayEnd = new Date();
        todayEnd.setHours(23, 59, 59, 999);

        const todayOrders = await this.orderRepo.count({
            where: {
                merchantId,
                createdAt: Between(todayStart, todayEnd),
            },
        });

        const pendingOrders = await this.orderRepo.count({
            where: {
                merchantId,
                status: In([OrderStatus.PENDING, OrderStatus.ACCEPTED, OrderStatus.PREPARING]),
            },
        });

        const activeOrders = await this.orderRepo.count({
            where: {
                merchantId,
                status: In([OrderStatus.READY_FOR_PICKUP, OrderStatus.DRIVER_ASSIGNED, OrderStatus.PICKED_UP, OrderStatus.IN_TRANSIT]), // "In transit" equivalents
            },
        });

        const completedOrders = await this.orderRepo.count({
            where: {
                merchantId,
                status: OrderStatus.COMPLETED,
            },
        });

        const wallet = await this.walletService.getWallet(merchantId);
        const walletBalance = wallet ? Number(wallet.balance) : 0;
        const totalSales = stats ? Number(stats.totalRevenue) : 0;

        // Calculate conversion rate
        const viewCount = stats ? stats.viewCount : 0;
        const conversionRate = viewCount > 0 ? (completedOrders / viewCount) * 100 : 0;

        return {
            profile: {
                ...profile,
                storeLink: `https://velocouriersvc.com/store/${profile.slug || profile.id}`,
            },
            stats: stats ? {
                ...stats,
                conversionRate: Number(conversionRate.toFixed(2)),
            } as any : null,
            todayOrders,
            pendingOrders,
            activeOrders,
            completedOrders,
            totalSales,
            walletBalance,
            isOpen: profile.isOpen,
        };
    }

    // ── Operating Hours ─────────────────────────────────────────────

    /**
     * Get all operating hours for a merchant.
     */
    async getOperatingHours(merchantId: string): Promise<MerchantOperatingHours[]> {
        return this.hoursRepo.find({
            where: { merchantId },
            order: { dayOfWeek: "ASC" },
        });
    }

    /**
     * Set operating hours (upserts all 7 days at once).
     */
    async setOperatingHours(
        merchantId: string,
        hours: OperatingHoursInput[]
    ): Promise<MerchantOperatingHours[]> {
        // Validate - must have 7 days (0-6)
        const days = hours.map((h) => h.dayOfWeek);
        const uniqueDays = new Set(days);
        if (uniqueDays.size !== days.length) {
            throw new Error("Duplicate days detected in operating hours");
        }

        // Delete existing and re-insert
        await this.hoursRepo.delete({ merchantId });

        const entities = hours.map((h) =>
            this.hoursRepo.create({
                merchantId,
                dayOfWeek: h.dayOfWeek,
                openTime: h.openTime,
                closeTime: h.closeTime,
                isClosed: h.isClosed,
            })
        );

        await this.hoursRepo.save(entities);
        log.info("Operating hours set", { merchantId, days: hours.length });

        return this.getOperatingHours(merchantId);
    }

    /**
     * Update operating hours for a single day.
     */
    async updateDayHours(
        merchantId: string,
        dayOfWeek: number,
        input: Partial<OperatingHoursInput>
    ): Promise<MerchantOperatingHours> {
        let hours = await this.hoursRepo.findOne({
            where: { merchantId, dayOfWeek },
        });

        if (!hours) {
            // Create a new entry for this day
            hours = this.hoursRepo.create({
                merchantId,
                dayOfWeek,
                openTime: input.openTime || "09:00",
                closeTime: input.closeTime || "17:00",
                isClosed: input.isClosed ?? false,
            });
        } else {
            if (input.openTime !== undefined) hours.openTime = input.openTime;
            if (input.closeTime !== undefined) hours.closeTime = input.closeTime;
            if (input.isClosed !== undefined) hours.isClosed = input.isClosed;
        }

        return this.hoursRepo.save(hours);
    }

    // ── Orders (Merchant perspective) ───────────────────────────────

    /**
     * List merchant's orders with optional status filter and pagination.
     */
    async getOrders(
        merchantId: string,
        params: {
            status?: OrderStatus;
            page?: number;
            limit?: number;
        }
    ): Promise<{ orders: Order[]; total: number; page: number; limit: number }> {
        const page = params.page || 1;
        const limit = Math.min(params.limit || 20, 50);
        const offset = (page - 1) * limit;

        const where: FindOptionsWhere<Order> = { merchantId };
        if (params.status) where.status = params.status;

        const [orders, total] = await this.orderRepo.findAndCount({
            where,
            relations: { customer: true, driver: true, statusHistory: true },
            order: { createdAt: "DESC" },
            skip: offset,
            take: limit,
        });

        return { orders, total, page, limit };
    }

    /**
     * Accept a pending order.
     */
    async acceptOrder(
        merchantId: string,
        orderId: string,
        estimatedPrepTime?: number
    ): Promise<Order> {
        const order = await this.orderRepo.findOne({
            where: { id: orderId, merchantId },
        });

        if (!order) throw new Error("Order not found");
        if (order.status !== OrderStatus.PENDING) {
            throw new Error(`Cannot accept order in ${order.status} status`);
        }

        const fromStatus = order.status;
        order.status = OrderStatus.ACCEPTED;
        order.acceptedAt = new Date();
        if (estimatedPrepTime) {
            order.merchantNote = `Estimated prep time: ${estimatedPrepTime} min`;
        }

        await this.orderRepo.save(order);
        await this.recordStatusChange(orderId, fromStatus, OrderStatus.ACCEPTED, merchantId, "merchant");

        // Emit WebSocket event for real-time tracking
        emitOrderEvent(orderId, "order:status", {
            orderId,
            status: OrderStatus.ACCEPTED,
            updatedAt: new Date().toISOString(),
        });

        // Notify customer
        await this.notificationService.notify(
            order.customerId,
            NotificationType.ORDER_ACCEPTED,
            "Order Accepted! 🎉",
            `Your order #${order.orderNumber} has been accepted${estimatedPrepTime ? ` and will be ready in ~${estimatedPrepTime} min` : ""}.`,
            { orderId, status: OrderStatus.ACCEPTED }
        );

        log.info("Order accepted", { orderId, merchantId });
        return order;
    }

    /**
     * Reject a pending order.
     */
    async rejectOrder(
        merchantId: string,
        orderId: string,
        reason: string
    ): Promise<Order> {
        const order = await this.orderRepo.findOne({
            where: { id: orderId, merchantId },
        });

        if (!order) throw new Error("Order not found");
        if (order.status !== OrderStatus.PENDING) {
            throw new Error(`Cannot reject order in ${order.status} status`);
        }

        const fromStatus = order.status;
        order.status = OrderStatus.CANCELLED;
        order.cancelledBy = OrderCancelledBy.MERCHANT;
        order.cancellationReason = reason;
        order.cancelledAt = new Date();

        await this.orderRepo.save(order);
        await this.recordStatusChange(orderId, fromStatus, OrderStatus.CANCELLED, merchantId, "merchant", reason);

        // Emit WebSocket event for real-time tracking
        emitOrderEvent(orderId, "order:status", {
            orderId,
            status: OrderStatus.CANCELLED,
            updatedAt: new Date().toISOString(),
        });

        // Notify customer
        await this.notificationService.notify(
            order.customerId,
            NotificationType.ORDER_CANCELLED,
            "Order Declined",
            `Sorry, your order #${order.orderNumber} could not be fulfilled. Reason: ${reason}`,
            { orderId, status: OrderStatus.CANCELLED }
        );

        log.info("Order rejected", { orderId, merchantId, reason });
        return order;
    }

    /**
     * Update order status - merchant can transition:
     * ACCEPTED → PREPARING → READY_FOR_PICKUP
     */
    async updateOrderStatus(
        merchantId: string,
        orderId: string,
        newStatus: OrderStatus
    ): Promise<Order> {
        const order = await this.orderRepo.findOne({
            where: { id: orderId, merchantId },
        });

        if (!order) throw new Error("Order not found");

        // Validate allowed transitions for merchant
        const allowedTransitions: Record<string, string[]> = {
            [OrderStatus.ACCEPTED]: [OrderStatus.PREPARING],
            [OrderStatus.PREPARING]: [OrderStatus.READY_FOR_PICKUP, OrderStatus.READY_FOR_DELIVERY],
        };

        const allowed = allowedTransitions[order.status];
        if (!allowed || !allowed.includes(newStatus)) {
            throw new Error(`Cannot transition from ${order.status} to ${newStatus}`);
        }

        // Integrity check: match status to delivery type
        if (newStatus === OrderStatus.READY_FOR_PICKUP && order.deliveryType !== DeliveryType.PICKUP) {
            throw new Error("Cannot set READY_FOR_PICKUP for a delivery order. Use READY_FOR_DELIVERY.");
        }
        if (newStatus === OrderStatus.READY_FOR_DELIVERY && order.deliveryType !== DeliveryType.DELIVERY) {
            throw new Error("Cannot set READY_FOR_DELIVERY for a pickup order. Use READY_FOR_PICKUP.");
        }

        const fromStatus = order.status;
        order.status = newStatus;

        if (newStatus === OrderStatus.PREPARING) {
            order.preparingAt = new Date();
        } else if (newStatus === OrderStatus.READY_FOR_PICKUP || newStatus === OrderStatus.READY_FOR_DELIVERY) {
            order.readyAt = new Date();
        }

        await this.orderRepo.save(order);
        await this.recordStatusChange(orderId, fromStatus, newStatus, merchantId, "merchant");

        // Emit WebSocket event for real-time tracking
        emitOrderEvent(orderId, "order:status", {
            orderId,
            status: newStatus,
            updatedAt: new Date().toISOString(),
        });

        // Notify customer on key transitions
        const statusMessages: Record<string, { title: string; body: string; type: NotificationType }> = {
            [OrderStatus.PREPARING]: {
                title: "Order Being Prepared 🍳",
                body: `Your order #${order.orderNumber} is now being prepared!`,
                type: NotificationType.ORDER_PREPARING,
            },
            [OrderStatus.READY_FOR_PICKUP]: {
                title: "Order Ready! 📦",
                body: `Your order #${order.orderNumber} is ready for pickup! Come on over.`,
                type: NotificationType.ORDER_READY,
            },
            [OrderStatus.READY_FOR_DELIVERY]: {
                title: "Order Prepared! 🚀",
                body: `Your order #${order.orderNumber} is ready and we're looking for a driver.`,
                type: NotificationType.ORDER_READY,
            },
        };

        const msg = statusMessages[newStatus];
        if (msg) {
            await this.notificationService.notify(
                order.customerId,
                msg.type,
                msg.title,
                msg.body,
                { orderId, status: newStatus }
            );
        }

        log.info("Order status updated", { orderId, merchantId, fromStatus, newStatus });
        return order;
    }

    /**
     * Verify pickup code - driver shows code, merchant verifies.
     */
    async verifyPickupCode(
        merchantId: string,
        orderId: string,
        code: string
    ): Promise<{ verified: boolean; order: Order }> {
        const order = await this.orderRepo.findOne({
            where: { id: orderId, merchantId },
        });

        if (!order) throw new Error("Order not found");
        if (order.status !== OrderStatus.READY_FOR_PICKUP &&
            order.status !== OrderStatus.READY_FOR_DELIVERY &&
            order.status !== OrderStatus.DRIVER_ASSIGNED) {
            throw new Error(`Cannot verify pickup code in ${order.status} status`);
        }

        // Driver-merchant handshake: for a delivery order with a driver assigned, the
        // merchant enters the driver's 4-digit code. Otherwise (store pickup) it is the
        // customer's 6-char pickup code.
        const usingDriverCode = !!order.driverId && !!order.driverPickupCode;
        const expected = usingDriverCode ? order.driverPickupCode : order.pickupCode;
        if (!expected || expected !== code) {
            log.warn("Invalid pickup code attempt", { orderId, merchantId, usingDriverCode });
            return { verified: false, order };
        }

        const fromStatus = order.status;
        order.pickupCodeVerifiedAt = new Date();
        if (usingDriverCode) order.driverPickupVerifiedAt = new Date();
        order.status = OrderStatus.PICKED_UP;
        order.pickedUpAt = new Date();

        await this.orderRepo.save(order);
        await this.recordStatusChange(orderId, fromStatus, OrderStatus.PICKED_UP, merchantId, "merchant", "Pickup code verified");

        // Emit WebSocket event for real-time tracking
        emitOrderEvent(orderId, "order:status", {
            orderId,
            status: OrderStatus.PICKED_UP,
            updatedAt: new Date().toISOString(),
        });

        // Notify customer
        await this.notificationService.notify(
            order.customerId,
            NotificationType.ORDER_PICKED_UP,
            "Order Picked Up! 🚚",
            `Your order #${order.orderNumber} has been picked up and is on the way!`,
            { orderId, status: OrderStatus.PICKED_UP }
        );

        // Delivery orders: issue the drop-off code the customer gives the driver on
        // arrival, and send it by push + SMS (visible on the tracking screen too).
        if (usingDriverCode && order.deliveryType === DeliveryType.DELIVERY) {
            if (!order.deliveryCode) {
                order.deliveryCode = new PickupCodeService().generate();
            }
            order.requireDeliveryCode = true;
            await this.orderRepo.save(order);

            await this.notificationService.notify(
                order.customerId,
                NotificationType.ORDER_IN_TRANSIT,
                "Your delivery code 🔑",
                `Give code ${order.deliveryCode} to your driver on arrival to receive order #${order.orderNumber}.`,
                { orderId, deliveryCode: order.deliveryCode }
            );
            try {
                const customer = await this.userRepo.findOne({ where: { id: order.customerId } });
                if (customer?.phoneNumber) {
                    await this.notificationService.notifyBySms(
                        customer.phoneNumber,
                        `Velo: your delivery code for order #${order.orderNumber} is ${order.deliveryCode}. Give it to your driver on arrival.`
                    );
                }
            } catch (err) {
                log.warn("Delivery code SMS failed", { orderId, error: (err as Error).message });
            }
        }

        log.info("Pickup code verified", { orderId, merchantId });
        return { verified: true, order };
    }

    /**
     * Complete a pickup order after code verification → triggers settlement.
     * For pickup orders where the customer (or their delegate) picks up directly.
     * Verifies the code, then calls SettlementService.
     */
    async completePickupOrder(
        merchantId: string,
        orderId: string,
        pickupCode: string
    ): Promise<{ order: Order; settlement: SettlementResult }> {
        // Import here to avoid circular dependency
        const { SettlementService } = await import("./settlement-service");
        const settlementService = new SettlementService();

        // First verify the code
        const result = await this.verifyPickupCode(merchantId, orderId, pickupCode);
        if (!result.verified) {
            throw new Error("Invalid pickup code");
        }

        // Now trigger settlement
        const settlement = await settlementService.settleOrder(orderId, merchantId, "merchant");

        // Re-fetch the settled order
        const settledOrder = await this.orderRepo.findOne({ where: { id: orderId } });

        return {
            order: settledOrder || result.order,
            settlement,
        };
    }

    /**
     * Request a payout - merchant withdraws from wallet via momo/bank.
     */
    async requestPayout(
        merchantId: string,
        input: { amount: number; payoutMethod: string; accountNumber: string }
    ): Promise<{ success: boolean; message: string; reference: string }> {
        const { amount, payoutMethod, accountNumber } = input;

        if (amount <= 0) throw new Error("Amount must be greater than 0");
        if (!payoutMethod) throw new Error("Payout method is required");
        if (!accountNumber) throw new Error("Account number is required");

        // Check wallet balance
        const hasBalance = await this.walletService.hasEnoughBalance(merchantId, amount);
        if (!hasBalance) {
            throw new Error("Insufficient wallet balance for this payout");
        }

        // Get wallet for currency
        const wallet = await this.walletService.getWallet(merchantId);
        const currency = wallet?.currency || "GHS";

        // Debit wallet
        const tx = await this.walletService.debit(
            merchantId,
            amount,
            `Payout request: ${payoutMethod} → ${accountNumber}`,
            {
                type: "payout",
                payoutMethod,
                accountNumber,
                status: "pending", // Admin must approve actual disbursement
            }
        );

        // Notify merchant
        await this.notificationService.notify(
            merchantId,
            NotificationType.PAYOUT_REQUESTED,
            "Payout Requested 💸",
            `Your payout of ${formatCurrency(amount, currency)} has been submitted and is being processed.`,
            {
                amount,
                payoutMethod,
                accountNumber,
                reference: tx.reference,
            }
        );

        log.info("Payout requested", { merchantId, amount, payoutMethod, reference: tx.reference });

        return {
            success: true,
            message: "Payout request submitted successfully",
            reference: tx.reference,
        };
    }

    // ── Finances ────────────────────────────────────────────────────

    /**
     * Get merchant's financial overview.
     */
    async getFinances(merchantId: string): Promise<MerchantFinances> {
        // Wallet balance
        const wallet = await this.walletService.getWallet(merchantId);
        const walletBalance = wallet ? Number(wallet.balance) : 0;
        const currencyCode = wallet?.currency || "GHS";

        // Stats
        const stats = await this.statsRepo.findOne({ where: { merchantId } });

        // Pending settlement: sum of merchantEarnings for COMPLETED orders not yet settled
        const pendingResult = await this.orderRepo
            .createQueryBuilder("order")
            .select("COALESCE(SUM(order.merchantEarnings), 0)", "pending")
            .where("order.merchantId = :merchantId", { merchantId })
            .andWhere("order.status = :status", { status: OrderStatus.COMPLETED })
            .andWhere("order.paymentStatus != :settled", { settled: OrderPaymentStatus.SETTLED })
            .getRawOne();

        const pendingBalance = Number(pendingResult?.pending || 0);

        // Next payout date (assume nearest sunday)
        const nextPayout = new Date();
        nextPayout.setDate(nextPayout.getDate() + (7 - nextPayout.getDay()) % 7);

        // Recent wallet transactions (mapping to categorised structure)
        const rawTxs = wallet
            ? await AppDataSource.getRepository("wallet_transactions")
                  .createQueryBuilder("tx")
                  .where("tx.walletId = :walletId", { walletId: wallet.id })
                  .orderBy("tx.createdAt", "DESC")
                  .limit(10)
                  .getMany() as any[]
            : [];

        const recentTransactions = rawTxs.map(tx => this.mapTransaction(tx));

        return {
            walletBalance,
            pendingBalance,
            lifetimeEarnings: stats ? Number(stats.totalRevenue) : 0,
            nextPayoutDate: nextPayout.toISOString(),
            currencyCode,
            payoutLimit: 5000,
            recentTransactions,
        };
    }

    /**
     * Get paginated transactions list for activity screen.
     */
    async getTransactions(merchantId: string, page: number = 1, limit: number = 20) {
        const wallet = await this.walletService.getWallet(merchantId);
        if (!wallet) return { transactions: [], total: 0 };

        const skip = (page - 1) * limit;

        const [txs, total] = await AppDataSource.getRepository("wallet_transactions")
            .createQueryBuilder("tx")
            .where("tx.walletId = :walletId", { walletId: wallet.id })
            .orderBy("tx.createdAt", "DESC")
            .skip(skip)
            .take(limit)
            .getManyAndCount();

        return {
            transactions: txs.map(tx => this.mapTransaction(tx)),
            total,
            page,
            limit
        };
    }

    /**
     * Helper to map internal transaction data to categorised UI response.
     */
    private mapTransaction(tx: any): WalletTransactionResponse {
        const metadata = tx.metadata || {};
        const isDebit = tx.type === "debit";

        return {
            id: tx.reference,
            reference: tx.reference,
            category: metadata.type === "payout" ? "payout" : (metadata.type === "refund" ? "refund" : "payment"),
            type: tx.description,
            amount: isDebit ? -Math.abs(Number(tx.amount)) : Number(tx.amount),
            balanceAfter: Number(tx.balanceAfter),
            status: metadata.status === "failed" ? "failed" : (metadata.status === "pending" ? "processing" : "completed"),
            date: tx.createdAt.toISOString()
        };
    }

    // ── Stats ───────────────────────────────────────────────────────

    /**
     * Get merchant stats with calculated conversion rate.
     */
    async getStats(merchantId: string): Promise<any | null> {
        const stats = await this.statsRepo.findOne({ where: { merchantId } });
        if (!stats) return null;

        const completedOrders = await this.orderRepo.count({
            where: { merchantId, status: OrderStatus.COMPLETED },
        });

        const conversionRate = stats.viewCount > 0 ? (completedOrders / stats.viewCount) * 100 : 0;

        return {
            ...stats,
            conversionRate: Number(conversionRate.toFixed(2)),
        };
    }

    /**
     * Increment store view count.
     */
    async incrementViewCount(slugOrId: string): Promise<void> {
        let profile = await this.profileRepo.findOne({ where: { slug: slugOrId } });
        if (!profile) {
            profile = await this.profileRepo.findOne({ where: { id: slugOrId } });
        }
        if (!profile) {
            profile = await this.profileRepo.findOne({ where: { userId: slugOrId } });
        }
        if (!profile) return;

        const merchantId = profile.userId;
        let stats = await this.statsRepo.findOne({ where: { merchantId } });

        if (!stats) {
            stats = this.statsRepo.create({
                merchantId,
                viewCount: 1,
            });
        } else {
            stats.viewCount += 1;
        }

        await this.statsRepo.save(stats);
        log.info("Store view incremented", { merchantId, slugOrId });
    }

    /**
     * Increment order counts in merchant stats (called by order service on completion).
     */
    async recordOrderCompletion(merchantId: string, merchantEarnings: number): Promise<void> {
        let stats = await this.statsRepo.findOne({ where: { merchantId } });

        if (!stats) {
            stats = this.statsRepo.create({
                merchantId,
                totalOrders: 1,
                totalRevenue: merchantEarnings,
            });
        } else {
            stats.totalOrders += 1;
            stats.totalRevenue = Number(stats.totalRevenue) + merchantEarnings;
        }

        await this.statsRepo.save(stats);
    }

    /**
     * Update merchant rating (called by rating service when buyer rates merchant).
     */
    async updateRating(merchantId: string, newRating: number): Promise<void> {
        let stats = await this.statsRepo.findOne({ where: { merchantId } });

        if (!stats) {
            stats = this.statsRepo.create({
                merchantId,
                averageRating: newRating,
                ratingCount: 1,
            });
        } else {
            // Weighted average
            const totalRating = Number(stats.averageRating) * stats.ratingCount + newRating;
            stats.ratingCount += 1;
            stats.averageRating = totalRating / stats.ratingCount;
        }

        await this.statsRepo.save(stats);
    }

    // ── Helpers ──────────────────────────────────────────────────────

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
