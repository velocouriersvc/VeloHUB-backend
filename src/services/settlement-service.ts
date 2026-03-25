import { AppDataSource } from "../db/data-source";
import {
    Order,
    OrderStatus,
    OrderPaymentMethod,
    OrderPaymentStatus,
    DeliveryType,
} from "../models/order";
import { Ride, RideStatus, PaymentMethod as RidePaymentMethod, PaymentStatus as RidePaymentStatus, RideType } from "../models/ride";
import { OrderStatusHistory } from "../models/order-status-history";
import { PlatformSettings } from "../models/platform-settings";
import { MerchantProfile } from "../models/merchant-profile";
import { User } from "../models/user";
import { WalletService } from "./wallet-service";
import { MerchantService } from "./merchant-service";
import { NotificationService } from "./notification-service";
import { NotificationType } from "../models/notification";
import { createServiceLogger } from "../utils/logger";
import { formatCurrency } from "../utils/currency";
import { settlementEventsTotal, orderEventsTotal, rideEventsTotal } from "../utils/metrics";

const log = createServiceLogger("SettlementService");

// ── Result Types ────────────────────────────────────────────────────

export interface SettlementResult {
    orderId?: string;
    rideId?: string;
    orderNumber?: string;
    rideReference?: string;
    settlementType: SettlementType;
    merchantEarnings?: number;
    driverEarnings: number;
    platformFee: number;
    currency: string;
    merchantWalletCredited?: boolean;
    driverWalletCredited: boolean;
    driverWalletDebited: boolean;
    merchantWalletDebited?: boolean;
}

export type SettlementType =
    | "cash_delivery"
    | "cash_pickup"
    | "online_delivery"
    | "online_pickup"
    | "cash_ride"
    | "online_ride";

// ── Service ─────────────────────────────────────────────────────────

/**
 * SettlementService — Handles all 4 settlement flows:
 *
 * 1. Cash + Delivery:   Driver collects cash → debit driver wallet, credit merchant wallet
 * 2. Cash + Pickup:     Merchant collects cash → debit merchant wallet (platform fee only)
 * 3. Online + Delivery: Platform holds funds → credit merchant wallet + credit driver wallet
 * 4. Online + Pickup:   Platform holds funds → credit merchant wallet
 *
 * Settlement metadata is stored on every WalletTransaction for audit.
 */
export class SettlementService {
    private orderRepo = AppDataSource.getRepository(Order);
    private rideRepo = AppDataSource.getRepository(Ride);
    private historyRepo = AppDataSource.getRepository(OrderStatusHistory);
    private settingsRepo = AppDataSource.getRepository(PlatformSettings);
    private merchantProfileRepo = AppDataSource.getRepository(MerchantProfile);
    private userRepo = AppDataSource.getRepository(User);

    private walletService = new WalletService();
    private merchantService = new MerchantService();
    private notificationService = new NotificationService();

    // ── Main Settlement Dispatcher ──────────────────────────────────

    /**
     * Settle an order — called when:
     *  - Pickup orders: merchant verifies pickup code (customer picks up) OR merchant marks self-pickup complete
     *  - Delivery orders: driver confirms delivery
     *
     * Determines settlement type from order.paymentMethod + order.deliveryType,
     * then delegates to the appropriate flow.
     */
    async settleOrder(
        orderId: string,
        completedBy: string,
        completedByRole: "merchant" | "driver" | "system" | "admin"
    ): Promise<SettlementResult> {
        const order = await this.orderRepo.findOne({
            where: { id: orderId },
            relations: { customer: true },
        });

        if (!order) throw new Error("Order not found");

        // Prevent double settlement
        if (order.paymentStatus === OrderPaymentStatus.SETTLED) {
            throw new Error("Order has already been settled");
        }

        // Only settle completed/delivered/picked-up orders
        const settlableStatuses = [
            OrderStatus.DELIVERED,
            OrderStatus.PICKED_UP,
            OrderStatus.COMPLETED,
            OrderStatus.READY_FOR_PICKUP, // direct pickup by customer (no driver)
        ];
        if (!settlableStatuses.includes(order.status)) {
            throw new Error(`Cannot settle order in "${order.status}" status`);
        }

        // Resolve currency
        const user = await this.userRepo.findOne({ where: { id: order.customerId } });
        const country = user?.country || "GH";
        const settings = await this.settingsRepo.findOne({ where: { country, isActive: true } });
        const currency = order.currency || settings?.currency || "GHS";

        // Determine settlement type
        const isCash = order.paymentMethod === OrderPaymentMethod.CASH;
        const isDelivery = order.deliveryType === DeliveryType.DELIVERY;

        let settlementType: SettlementType;
        if (isCash && isDelivery) settlementType = "cash_delivery";
        else if (isCash && !isDelivery) settlementType = "cash_pickup";
        else if (!isCash && isDelivery) settlementType = "online_delivery";
        else settlementType = "online_pickup";

        // Calculate amounts
        const subtotal = Number(order.subtotal);
        const commission = Number(order.commission);
        const serviceFee = Number(order.serviceFee);
        const deliveryFee = Number(order.deliveryFee);
        const merchantEarnings = Number(order.merchantEarnings);
        const platformFee = commission + serviceFee;

        // Build metadata for all wallet transactions
        const txMetadata = {
            orderId: order.id,
            orderNumber: order.orderNumber,
            settlementType,
            breakdown: {
                subtotal,
                commission,
                serviceFee,
                deliveryFee,
                merchantEarnings,
                platformFee,
            },
        };

        let result: SettlementResult;

        switch (settlementType) {
            case "cash_delivery":
                result = await this.settleCashDelivery(order, settings, merchantEarnings, platformFee, deliveryFee, currency, txMetadata);
                break;
            case "cash_pickup":
                result = await this.settleCashPickup(order, settings, currency, txMetadata);
                break;
            case "online_delivery":
                result = await this.settleOnlineDelivery(order, settings, merchantEarnings, deliveryFee, currency, txMetadata);
                break;
            case "online_pickup":
                result = await this.settleOnlinePickup(order, merchantEarnings, currency, txMetadata);
                break;
        }

        // ── Post-settlement actions ─────────────────────────────────

        // 1. Mark order as completed + settled
        const fromStatus = order.status;
        order.status = OrderStatus.COMPLETED;
        order.paymentStatus = OrderPaymentStatus.SETTLED;
        order.completedAt = new Date();
        await this.orderRepo.save(order);

        // 2. Record status change
        await this.recordStatusChange(
            orderId,
            fromStatus,
            OrderStatus.COMPLETED,
            completedBy,
            completedByRole,
            `Order settled (${settlementType})`
        );

        // 3. Update merchant stats
        await this.merchantService.recordOrderCompletion(order.merchantId, merchantEarnings);

        // 4. Notifications
        await this.sendSettlementNotifications(order, result, currency);

        // 5. Metrics
        settlementEventsTotal.inc({ type: settlementType, method: order.paymentMethod });
        orderEventsTotal.inc({ status: "completed", type: order.deliveryType });

        log.info("Order settled", {
            orderId,
            settlementType,
            merchantEarnings: result.merchantEarnings,
            driverEarnings: result.driverEarnings,
            platformFee: result.platformFee,
        });

        return result;
    }

    // ── Ride Settlement Dispatcher ──────────────────────────────────

    /**
     * Settle a ride — called when driver confirms completion.
     */
    async settleRide(
        rideId: string,
        completedBy: string,
        completedByRole: "driver" | "system" | "admin"
    ): Promise<SettlementResult> {
        const ride = await this.rideRepo.findOne({
            where: { id: rideId },
            relations: { customer: true },
        });

        if (!ride) throw new Error("Ride not found");

        // Prevent double settlement
        if (ride.paymentStatus === RidePaymentStatus.PAID && ride.status === RideStatus.COMPLETED) {
             // In some flows COMPLETED might already exist, but we check if we actually ran settlement
             // We'll use a metadata flag or just check if it's already completed.
        }

        if (ride.status === RideStatus.COMPLETED) {
            throw new Error("Ride has already been settled/completed");
        }

        // Only settle ongoing rides being completed
        if (ride.status !== RideStatus.ONGOING) {
            throw new Error(`Cannot settle ride in "${ride.status}" status`);
        }

        // Resolve currency/country
        const user = await this.userRepo.findOne({ where: { id: ride.customerId } });
        const country = user?.country || "GH";
        const settings = await this.settingsRepo.findOne({ where: { country, isActive: true } });
        const currency = ride.currency || settings?.currency || "GHS";

        // Determine settlement type
        const isCash = ride.paymentMethod === RidePaymentMethod.CASH;
        const settlementType: SettlementType = isCash ? "cash_ride" : "online_ride";

        // Calculate amounts
        const finalFare = Number(ride.finalFare);
        
        let commissionRate = settings?.rideCommissionRate || 20;
        if (ride.type === RideType.DELIVERY) {
            commissionRate = settings?.deliveryTotalCommissionRate || 40;
        }

        const platformFee = Math.round(finalFare * (Number(commissionRate) / 100) * 100) / 100;
        const driverEarnings = finalFare - platformFee;

        // Build metadata
        const txMetadata = {
            rideId: ride.id,
            rideReference: `RIDE-${ride.id.split('-')[0].toUpperCase()}`,
            type: ride.type,
            settlementType,
            breakdown: {
                finalFare,
                platformFee,
                driverEarnings,
                commissionRate
            },
        };

        let result: SettlementResult;

        if (isCash) {
            result = await this.settleCashRide(ride, driverEarnings, platformFee, currency, txMetadata);
        } else {
            result = await this.settleOnlineRide(ride, driverEarnings, platformFee, currency, txMetadata);
        }

        // ── Post-settlement actions ─────────────────────────────────

        // 1. Mark ride as completed + paid
        ride.status = RideStatus.COMPLETED;
        ride.paymentStatus = RidePaymentStatus.PAID;
        ride.commission = platformFee;
        ride.driverPayout = driverEarnings;
        ride.completedAt = new Date();
        if (!ride.paidAt) ride.paidAt = new Date();
        await this.rideRepo.save(ride);

        // 2. Notifications
        await this.sendRideSettlementNotifications(ride, result, currency);

        // 3. Metrics
        settlementEventsTotal.inc({ type: settlementType, method: ride.paymentMethod || 'unknown' });
        rideEventsTotal.inc({ event: "completed" });

        log.info("Ride settled", {
            rideId,
            settlementType,
            driverEarnings: result.driverEarnings,
            platformFee: result.platformFee,
        });

        return result;
    }

    private async settleCashRide(
        ride: Ride,
        driverEarnings: number,
        platformFee: number,
        currency: string,
        metadata: Record<string, any>
    ): Promise<SettlementResult> {
        // Cash Ride: Driver collected full FinalFare.
        // They OWE the platformFee to the platform.
        // DEBIT driver.wallet → platformFee
        
        let driverDebited = false;

        if (ride.driverId && platformFee > 0) {
            try {
                await this.walletService.debit(
                    ride.driverId,
                    platformFee,
                    `Platform commission: Ride #${metadata.rideReference}`,
                    metadata
                );
                driverDebited = true;
            } catch (err) {
                log.warn("Driver wallet debit failed for ride commission", {
                    driverId: ride.driverId,
                    amount: platformFee,
                    error: (err as Error).message,
                });
            }
        }

        return {
            rideId: ride.id,
            rideReference: metadata.rideReference,
            settlementType: "cash_ride",
            driverEarnings,
            platformFee,
            currency,
            driverWalletCredited: false,
            driverWalletDebited: driverDebited,
        };
    }

    private async settleOnlineRide(
        ride: Ride,
        driverEarnings: number,
        platformFee: number,
        currency: string,
        metadata: Record<string, any>
    ): Promise<SettlementResult> {
        // Online Ride (Wallet/Momo): Platform holds full FinalFare.
        // Platform keeps platformFee.
        // CREDIT driver.wallet → driverEarnings

        let driverCredited = false;

        if (ride.driverId && driverEarnings > 0) {
            await this.walletService.credit(
                ride.driverId,
                driverEarnings,
                `Ride earnings: #${metadata.rideReference}`,
                metadata
            );
            driverCredited = true;
        }

        return {
            rideId: ride.id,
            rideReference: metadata.rideReference,
            settlementType: "online_ride",
            driverEarnings,
            platformFee,
            currency,
            driverWalletCredited: driverCredited,
            driverWalletDebited: false,
        };
    }

    private async sendRideSettlementNotifications(
        ride: Ride,
        settlement: SettlementResult,
        currency: string
    ): Promise<void> {
        // Notify customer
        await this.notificationService.notify(
            ride.customerId,
            NotificationType.RIDE_COMPLETED,
            "Ride Completed! ✅",
            `Your ride to ${ride.dropoffAddress} has been completed.`,
            { rideId: ride.id, fare: Number(ride.finalFare) }
        );

        // Notify driver
        if (ride.driverId) {
            if (settlement.driverWalletCredited) {
                await this.notificationService.notify(
                    ride.driverId,
                    NotificationType.WALLET_CREDITED,
                    "Ride Earnings 💰",
                    `${formatCurrency(settlement.driverEarnings, currency)} credited to your wallet.`,
                    { rideId: ride.id, amount: settlement.driverEarnings }
                );
            }

            if (settlement.driverWalletDebited) {
                await this.notificationService.notify(
                    ride.driverId,
                    NotificationType.COMMISSION_DEDUCTED,
                    "Commission Deducted",
                    `${formatCurrency(settlement.platformFee, currency)} deducted for cash ride commission.`,
                    { rideId: ride.id, amount: settlement.platformFee }
                );
            }
        }
    }

    // ── Flow 1: Cash + Delivery ─────────────────────────────────────
    //
    // Driver collected cash from customer.
    //  • DEBIT driver.wallet → (merchantAmount + platformFee) — driver owes platform + merchant
    //  • CREDIT merchant.wallet → merchantAmount
    //  • Platform keeps platformFee (already deducted from driver)

    private async settleCashDelivery(
        order: Order,
        settings: PlatformSettings | null,
        merchantEarnings: number,
        platformFee: number,
        deliveryFee: number,
        currency: string,
        metadata: Record<string, any>
    ): Promise<SettlementResult> {
        // Calculate internal split for audit
        const ridePortionRate = Number(settings?.deliveryRidePortionRate || 50);
        const servicePortionRate = Number(settings?.deliveryServicePortionRate || 50);
        
        const totalCommission = Number(order.commission);
        const ridesInternalAmount = Math.round(totalCommission * (ridePortionRate / 100) * 100) / 100;
        const deliveryServiceInternalAmount = totalCommission - ridesInternalAmount;

        metadata.breakdown = {
            ...metadata.breakdown,
            internalCommissionSplit: {
                ridesAmount: ridesInternalAmount,
                deliveryServiceAmount: deliveryServiceInternalAmount,
                ridesPortionPercent: ridePortionRate,
                deliveryServicePortionPercent: servicePortionRate
            }
        };

        const totalCashCollected = Number(order.totalAmount);
        // Driver keeps deliveryFee as their earnings
        const driverOwes = totalCashCollected - deliveryFee;

        let driverDebited = false;
        let merchantCredited = false;

        // Debit driver — they owe (merchantEarnings + platformFee) from the cash collected
        if (order.driverId && driverOwes > 0) {
            try {
                await this.walletService.debit(
                    order.driverId,
                    driverOwes,
                    `Cash settlement: Order #${order.orderNumber}`,
                    metadata
                );
                driverDebited = true;
            } catch (err) {
                log.warn("Driver wallet debit failed (insufficient balance?)", {
                    driverId: order.driverId,
                    amount: driverOwes,
                    error: (err as Error).message,
                });
                // Don't fail settlement — flag it for admin review
            }
        }

        // Credit merchant
        if (merchantEarnings > 0) {
            await this.walletService.credit(
                order.merchantId,
                merchantEarnings,
                `Earnings: Order #${order.orderNumber}`,
                metadata
            );
            merchantCredited = true;
        }

        return {
            orderId: order.id,
            orderNumber: order.orderNumber,
            settlementType: "cash_delivery",
            merchantEarnings,
            driverEarnings: deliveryFee,
            platformFee,
            currency,
            merchantWalletCredited: merchantCredited,
            driverWalletCredited: false,
            driverWalletDebited: driverDebited,
            merchantWalletDebited: false,
        };
    }

    // ── Flow 2: Cash + Pickup ───────────────────────────────────────
    //
    // Merchant collected cash from customer.
    //  • DEBIT merchant.wallet → platformFee (pickup fee)
    //  • Merchant keeps the rest (they already have the cash)

    private async settleCashPickup(
        order: Order,
        settings: PlatformSettings | null,
        currency: string,
        metadata: Record<string, any>
    ): Promise<SettlementResult> {
        // For pickup orders, use pickupFeeRate instead of commission+serviceFee
        const merchant = await this.merchantProfileRepo.findOne({
            where: { userId: order.merchantId },
        });

        const pickupFeeRate =
            merchant?.pickupFeeRate !== null && merchant?.pickupFeeRate !== undefined
                ? Number(merchant.pickupFeeRate)
                : settings?.defaultPickupFeeRate !== undefined
                ? Number(settings.defaultPickupFeeRate)
                : 10;

        const subtotal = Number(order.subtotal);
        const platformFee = Math.round(subtotal * (pickupFeeRate / 100) * 100) / 100;

        let merchantDebited = false;

        // Debit merchant — they owe platform fee from the cash they collected
        if (platformFee > 0) {
            try {
                await this.walletService.debit(
                    order.merchantId,
                    platformFee,
                    `Pickup fee: Order #${order.orderNumber}`,
                    metadata
                );
                merchantDebited = true;
            } catch (err) {
                log.warn("Merchant wallet debit failed for pickup fee", {
                    merchantId: order.merchantId,
                    amount: platformFee,
                    error: (err as Error).message,
                });
            }
        }

        const merchantEarnings = subtotal - platformFee;

        return {
            orderId: order.id,
            orderNumber: order.orderNumber,
            settlementType: "cash_pickup",
            merchantEarnings,
            driverEarnings: 0,
            platformFee,
            currency,
            merchantWalletCredited: false,
            driverWalletCredited: false,
            driverWalletDebited: false,
            merchantWalletDebited: merchantDebited,
        };
    }

    // ── Flow 3: Online + Delivery ───────────────────────────────────
    //
    // Platform already charged customer via Paystack/Stripe.
    //  • CREDIT merchant.wallet → merchantEarnings
    //  • CREDIT driver.wallet → deliveryFee
    //  • Platform retains: commission + serviceFee

    private async settleOnlineDelivery(
        order: Order,
        settings: PlatformSettings | null,
        merchantEarnings: number,
        deliveryFee: number,
        currency: string,
        metadata: Record<string, any>
    ): Promise<SettlementResult> {
        // Calculate internal split for audit
        const ridePortionRate = Number(settings?.deliveryRidePortionRate || 50);
        const servicePortionRate = Number(settings?.deliveryServicePortionRate || 50);
        
        const totalCommission = Number(order.commission);
        const ridesInternalAmount = Math.round(totalCommission * (ridePortionRate / 100) * 100) / 100;
        const deliveryServiceInternalAmount = totalCommission - ridesInternalAmount;

        metadata.breakdown = {
            ...metadata.breakdown,
            internalCommissionSplit: {
                ridesAmount: ridesInternalAmount,
                deliveryServiceAmount: deliveryServiceInternalAmount,
                ridesPortionPercent: ridePortionRate,
                deliveryServicePortionPercent: servicePortionRate
            }
        };

        let merchantCredited = false;
        let driverCredited = false;

        // Credit merchant
        if (merchantEarnings > 0) {
            await this.walletService.credit(
                order.merchantId,
                merchantEarnings,
                `Earnings: Order #${order.orderNumber}`,
                metadata
            );
            merchantCredited = true;
        }

        // Credit driver (delivery fee)
        if (order.driverId && deliveryFee > 0) {
            await this.walletService.credit(
                order.driverId,
                deliveryFee,
                `Delivery earnings: Order #${order.orderNumber}`,
                metadata
            );
            driverCredited = true;
        }

        const platformFee = Number(order.commission) + Number(order.serviceFee);

        return {
            orderId: order.id,
            orderNumber: order.orderNumber,
            settlementType: "online_delivery",
            merchantEarnings,
            driverEarnings: deliveryFee,
            platformFee,
            currency,
            merchantWalletCredited: merchantCredited,
            driverWalletCredited: driverCredited,
            driverWalletDebited: false,
            merchantWalletDebited: false,
        };
    }

    // ── Flow 4: Online + Pickup ─────────────────────────────────────
    //
    // Platform already charged customer.
    //  • CREDIT merchant.wallet → merchantEarnings
    //  • Platform retains: platformFee

    private async settleOnlinePickup(
        order: Order,
        merchantEarnings: number,
        currency: string,
        metadata: Record<string, any>
    ): Promise<SettlementResult> {
        let merchantCredited = false;

        // Credit merchant
        if (merchantEarnings > 0) {
            await this.walletService.credit(
                order.merchantId,
                merchantEarnings,
                `Earnings: Order #${order.orderNumber}`,
                metadata
            );
            merchantCredited = true;
        }

        const platformFee = Number(order.commission) + Number(order.serviceFee);

        return {
            orderId: order.id,
            orderNumber: order.orderNumber,
            settlementType: "online_pickup",
            merchantEarnings,
            driverEarnings: 0,
            platformFee,
            currency,
            merchantWalletCredited: merchantCredited,
            driverWalletCredited: false,
            driverWalletDebited: false,
            merchantWalletDebited: false,
        };
    }

    // ── Notifications ───────────────────────────────────────────────

    private async sendSettlementNotifications(
        order: Order,
        settlement: SettlementResult,
        currency: string
    ): Promise<void> {
        // Notify customer — order completed
        await this.notificationService.notify(
            order.customerId,
            NotificationType.ORDER_COMPLETED,
            "Order Completed! ✅",
            `Your order #${order.orderNumber} has been completed. Thank you!`,
            { orderId: order.id, orderNumber: order.orderNumber, status: OrderStatus.COMPLETED }
        );

        // Notify merchant — earnings credited
        if (settlement.merchantWalletCredited) {
            await this.notificationService.notify(
                order.merchantId,
                NotificationType.WALLET_CREDITED,
                "Earnings Received 💰",
                `${formatCurrency(settlement.merchantEarnings ?? 0, currency)} credited to your wallet for order #${order.orderNumber}.`,
                {
                    orderId: order.id,
                    orderNumber: order.orderNumber,
                    amount: settlement.merchantEarnings || 0,
                    settlementType: settlement.settlementType,
                }
            );
        }

        
        // Notify merchant — fee deducted (cash pickup)
        if (settlement.merchantWalletDebited) {
            await this.notificationService.notify(
                order.merchantId,
                NotificationType.COMMISSION_DEDUCTED,
                "Platform Fee Deducted",
                `${formatCurrency(settlement.platformFee, currency)} deducted for order #${order.orderNumber} (pickup fee).`,
                {
                    orderId: order.id,
                    orderNumber: order.orderNumber,
                    amount: settlement.platformFee,
                    settlementType: settlement.settlementType,
                }
            );
        }

        // Notify driver — earnings
        if (order.driverId && settlement.driverEarnings > 0) {
            if (settlement.driverWalletCredited) {
                await this.notificationService.notify(
                    order.driverId,
                    NotificationType.WALLET_CREDITED,
                    "Delivery Earnings 💰",
                    `${formatCurrency(settlement.driverEarnings, currency)} credited for delivering order #${order.orderNumber}.`,
                    {
                        orderId: order.id,
                        orderNumber: order.orderNumber,
                        amount: settlement.driverEarnings,
                    }
                );
            }

            // Cash delivery: driver debited
            if (settlement.driverWalletDebited) {
                await this.notificationService.notify(
                    order.driverId,
                    NotificationType.COMMISSION_DEDUCTED,
                    "Cash Settlement Processed",
                    `${formatCurrency(Number(order.totalAmount) - settlement.driverEarnings, currency)} settled from your wallet for cash order #${order.orderNumber}. Your delivery earning: ${formatCurrency(settlement.driverEarnings, currency)}.`,
                    {
                        orderId: order.id,
                        orderNumber: order.orderNumber,
                        settlementType: settlement.settlementType,
                    }
                );
            }
        }
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
