import { AppDataSource } from "../db/data-source";
import { Between, In, ILike, IsNull, Not } from "typeorm";
import { Order, OrderStatus, OrderPaymentStatus, OrderCancelledBy, DeliveryType } from "../models/order";
import { OrderStatusHistory } from "../models/order-status-history";
import { Product } from "../models/product";
import { MerchantProfile, MerchantVerificationStatus } from "../models/merchant-profile";
import { MerchantStats } from "../models/merchant-stats";
import { PlatformSettings } from "../models/platform-settings";
import { User, UserStatus } from "../models/user";
import { UserRole, RoleStatus } from "../models/user-role";
import { RoleType } from "../models/role";
import { Wallet } from "../models/wallet";
import { WalletTransaction } from "../models/wallet-transaction";
import { Ride } from "../models/ride";
import { WalletService } from "./wallet-service";
import { NotificationService } from "./notification-service";
import { NotificationType } from "../models/notification";
import { createServiceLogger } from "../utils/logger";
import { formatCurrency } from "../utils/currency";
import { orderEventsTotal } from "../utils/metrics";

const log = createServiceLogger("AdminService");

// ── Input / Result Types ────────────────────────────────────────────

export interface AdminOrderFilters {
    status?: OrderStatus;
    merchantId?: string;
    customerId?: string;
    paymentStatus?: OrderPaymentStatus;
    deliveryType?: DeliveryType;
    from?: string; // ISO date
    to?: string;   // ISO date
    page?: number;
    limit?: number;
}

export interface AdminProductFilters {
    merchantId?: string;
    category?: string;
    isActive?: boolean;
    search?: string;
    page?: number;
    limit?: number;
}

export interface AdminPayoutFilters {
    status?: "pending" | "completed" | "rejected";
    page?: number;
    limit?: number;
}

export interface RevenueReportResult {
    period: string;
    totalOrders: number;
    totalRevenue: number;
    totalCommission: number;
    totalServiceFees: number;
    totalDeliveryFees: number;
    totalDiscounts: number;
    totalMerchantEarnings: number;
    platformRevenue: number;
    currency: string;
}

export interface AdminDashboard {
    overview: {
        totalUsers: number;
        totalMerchants: number;
        totalDrivers: number;
        activeMerchants: number;
        activeDrivers: number;
    };
    today: {
        totalOrders: number;
        totalRides: number;
        orderRevenue: number;
        rideRevenue: number;
        platformFees: number;
    };
    pendingActions: {
        pendingMerchantApprovals: number;
        pendingDriverApprovals: number;
        pendingPayouts: number;
        pendingOrders: number;
    };
}

// ── Service ─────────────────────────────────────────────────────────

export class AdminService {
    private orderRepo = AppDataSource.getRepository(Order);
    private historyRepo = AppDataSource.getRepository(OrderStatusHistory);
    private productRepo = AppDataSource.getRepository(Product);
    private merchantProfileRepo = AppDataSource.getRepository(MerchantProfile);
    private merchantStatsRepo = AppDataSource.getRepository(MerchantStats);
    private settingsRepo = AppDataSource.getRepository(PlatformSettings);
    private userRepo = AppDataSource.getRepository(User);
    private userRoleRepo = AppDataSource.getRepository(UserRole);
    private walletRepo = AppDataSource.getRepository(Wallet);
    private walletTxRepo = AppDataSource.getRepository(WalletTransaction);
    private rideRepo = AppDataSource.getRepository(Ride);

    private walletService = new WalletService();
    private notificationService = new NotificationService();

    // ════════════════════════════════════════════════════════════════
    //  DASHBOARD
    // ════════════════════════════════════════════════════════════════

    async getDashboard(): Promise<AdminDashboard> {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        // Overview counts
        const [totalUsers, totalMerchants, totalDrivers] = await Promise.all([
            this.userRepo.count(),
            this.merchantProfileRepo.count(),
            this.userRoleRepo.count({
                where: { role: { name: RoleType.DRIVER } },
                relations: { role: true },
            }),
        ]);

        const activeMerchants = await this.merchantProfileRepo.count({
            where: { status: MerchantVerificationStatus.APPROVED, isOpen: true },
        });

        const activeDrivers = await this.userRoleRepo.count({
            where: { role: { name: RoleType.DRIVER }, status: RoleStatus.APPROVED },
            relations: { role: true },
        });

        // Today's numbers
        const todaysOrders = await this.orderRepo
            .createQueryBuilder("o")
            .where("o.createdAt >= :today", { today })
            .andWhere("o.createdAt < :tomorrow", { tomorrow })
            .getMany();

        const todaysRides = await this.rideRepo
            .createQueryBuilder("r")
            .where("r.createdAt >= :today", { today })
            .andWhere("r.createdAt < :tomorrow", { tomorrow })
            .getMany();

        const orderRevenue = todaysOrders.reduce(
            (sum, o) => sum + Number(o.totalAmount || 0),
            0
        );
        const rideRevenue = todaysRides.reduce(
            (sum, r) => sum + Number((r as any).fare || 0),
            0
        );
        const platformFees = todaysOrders.reduce(
            (sum, o) => sum + Number(o.commission || 0) + Number(o.serviceFee || 0),
            0
        );

        // Pending actions
        const [pendingMerchantApprovals, pendingDriverApprovals, pendingOrders] =
            await Promise.all([
                this.merchantProfileRepo.count({
                    where: { status: MerchantVerificationStatus.PENDING },
                }),
                this.userRoleRepo.count({
                    where: { role: { name: RoleType.DRIVER }, status: RoleStatus.PENDING },
                    relations: { role: true },
                }),
                this.orderRepo.count({
                    where: { status: OrderStatus.PENDING },
                }),
            ]);

        // Pending payouts — wallet transactions with payout metadata still pending
        const pendingPayouts = await this.walletTxRepo
            .createQueryBuilder("tx")
            .where("tx.metadata->>'type' = :type", { type: "payout" })
            .andWhere("tx.metadata->>'status' = :status", { status: "pending" })
            .getCount();

        return {
            overview: {
                totalUsers,
                totalMerchants,
                totalDrivers,
                activeMerchants,
                activeDrivers,
            },
            today: {
                totalOrders: todaysOrders.length,
                totalRides: todaysRides.length,
                orderRevenue: Math.round(orderRevenue * 100) / 100,
                rideRevenue: Math.round(rideRevenue * 100) / 100,
                platformFees: Math.round(platformFees * 100) / 100,
            },
            pendingActions: {
                pendingMerchantApprovals,
                pendingDriverApprovals,
                pendingPayouts,
                pendingOrders,
            },
        };
    }

    // ════════════════════════════════════════════════════════════════
    //  ORDERS
    // ════════════════════════════════════════════════════════════════

    async getOrders(filters: AdminOrderFilters) {
        const page = filters.page || 1;
        const limit = Math.min(filters.limit || 20, 100);
        const skip = (page - 1) * limit;

        const qb = this.orderRepo
            .createQueryBuilder("o")
            .leftJoinAndSelect("o.customer", "customer")
            .leftJoinAndSelect("o.merchant", "merchant")
            .leftJoinAndSelect("o.driver", "driver")
            .orderBy("o.createdAt", "DESC")
            .skip(skip)
            .take(limit);

        if (filters.status) qb.andWhere("o.status = :status", { status: filters.status });
        if (filters.merchantId) qb.andWhere("o.merchantId = :merchantId", { merchantId: filters.merchantId });
        if (filters.customerId) qb.andWhere("o.customerId = :customerId", { customerId: filters.customerId });
        if (filters.paymentStatus) qb.andWhere("o.paymentStatus = :ps", { ps: filters.paymentStatus });
        if (filters.deliveryType) qb.andWhere("o.deliveryType = :dt", { dt: filters.deliveryType });
        if (filters.from) qb.andWhere("o.createdAt >= :from", { from: filters.from });
        if (filters.to) qb.andWhere("o.createdAt <= :to", { to: filters.to });

        const [orders, total] = await qb.getManyAndCount();

        return {
            orders: orders.map((o) => ({
                id: o.id,
                orderNumber: o.orderNumber,
                status: o.status,
                paymentStatus: o.paymentStatus,
                paymentMethod: o.paymentMethod,
                deliveryType: o.deliveryType,
                subtotal: o.subtotal,
                totalAmount: o.totalAmount,
                commission: o.commission,
                serviceFee: o.serviceFee,
                deliveryFee: o.deliveryFee,
                merchantEarnings: o.merchantEarnings,
                currency: o.currency,
                customerPhone: o.customer?.phoneNumber,
                merchantPhone: o.merchant?.phoneNumber,
                driverPhone: o.driver?.phoneNumber,
                createdAt: o.createdAt,
            })),
            total,
            page,
            limit,
        };
    }

    async getOrderDetail(orderId: string) {
        const order = await this.orderRepo.findOne({
            where: { id: orderId },
            relations: {
                customer: true,
                merchant: true,
                driver: true,
                statusHistory: true,
            },
        });

        if (!order) throw new Error("Order not found");

        // Load merchant profile for extra details
        const merchantProfile = await this.merchantProfileRepo.findOne({
            where: { userId: order.merchantId },
        });

        return {
            ...order,
            merchantBusinessName: merchantProfile?.businessName || null,
            merchantCategory: merchantProfile?.category || null,
        };
    }

    async overrideOrderStatus(
        orderId: string,
        newStatus: OrderStatus,
        adminId: string,
        note?: string
    ) {
        const order = await this.orderRepo.findOne({ where: { id: orderId } });
        if (!order) throw new Error("Order not found");

        const fromStatus = order.status;
        order.status = newStatus;

        // Update relevant timestamp
        const now = new Date();
        switch (newStatus) {
            case OrderStatus.ACCEPTED: order.acceptedAt = now; break;
            case OrderStatus.PREPARING: order.preparingAt = now; break;
            case OrderStatus.READY_FOR_PICKUP: 
            case OrderStatus.READY_FOR_DELIVERY: 
                order.readyAt = now; 
                break;
            case OrderStatus.PICKED_UP: order.pickedUpAt = now; break;
            case OrderStatus.DELIVERED: order.deliveredAt = now; break;
            case OrderStatus.COMPLETED: order.completedAt = now; break;
            case OrderStatus.CANCELLED: order.cancelledAt = now; order.cancelledBy = OrderCancelledBy.ADMIN; break;
        }

        await this.orderRepo.save(order);

        // Record history
        await this.historyRepo.save(
            this.historyRepo.create({
                orderId,
                fromStatus,
                toStatus: newStatus,
                changedBy: adminId,
                changedByRole: "admin",
                note: note || `Admin override: ${fromStatus} → ${newStatus}`,
            })
        );

        orderEventsTotal.inc({ status: newStatus, type: "admin_override" });
        log.info("Admin order status override", { orderId, fromStatus, toStatus: newStatus, adminId });

        return order;
    }

    async refundOrder(orderId: string, adminId: string, reason?: string) {
        const order = await this.orderRepo.findOne({
            where: { id: orderId },
            relations: { customer: true },
        });
        if (!order) throw new Error("Order not found");

        if (order.status === OrderStatus.REFUNDED) {
            throw new Error("Order has already been refunded");
        }

        const fromStatus = order.status;
        order.status = OrderStatus.REFUNDED;
        order.paymentStatus = OrderPaymentStatus.REFUNDED;
        order.cancelledAt = new Date();
        order.cancelledBy = OrderCancelledBy.ADMIN;
        order.cancellationReason = reason || "Admin refund";

        await this.orderRepo.save(order);

        // Credit customer wallet as refund
        await this.walletService.credit(
            order.customerId,
            Number(order.totalAmount),
            `Refund: Order #${order.orderNumber}`,
            {
                orderId: order.id,
                orderNumber: order.orderNumber,
                type: "refund",
                refundedBy: adminId,
                reason,
            }
        );

        // Record history
        await this.historyRepo.save(
            this.historyRepo.create({
                orderId,
                fromStatus,
                toStatus: OrderStatus.REFUNDED,
                changedBy: adminId,
                changedByRole: "admin",
                note: reason || "Admin-initiated refund",
            })
        );

        // Notify customer
        await this.notificationService.notify(
            order.customerId,
            NotificationType.ORDER_CANCELLED,
            "Order Refunded 💰",
            `Your order #${order.orderNumber} has been refunded. ${formatCurrency(Number(order.totalAmount), order.currency)} has been credited to your wallet.`,
            { orderId, orderNumber: order.orderNumber, amount: Number(order.totalAmount) }
        );

        orderEventsTotal.inc({ status: "refunded", type: "admin_refund" });
        log.info("Admin refund processed", { orderId, amount: order.totalAmount, adminId });

        return order;
    }

    async adminCancelOrder(orderId: string, adminId: string, reason?: string) {
        const order = await this.orderRepo.findOne({
            where: { id: orderId },
            relations: { customer: true },
        });
        if (!order) throw new Error("Order not found");

        if ([OrderStatus.COMPLETED, OrderStatus.REFUNDED, OrderStatus.CANCELLED].includes(order.status)) {
            throw new Error(`Cannot cancel order in "${order.status}" status`);
        }

        const fromStatus = order.status;
        order.status = OrderStatus.CANCELLED;
        order.cancelledAt = new Date();
        order.cancelledBy = OrderCancelledBy.ADMIN;
        order.cancellationReason = reason || "Cancelled by admin";

        await this.orderRepo.save(order);

        await this.historyRepo.save(
            this.historyRepo.create({
                orderId,
                fromStatus,
                toStatus: OrderStatus.CANCELLED,
                changedBy: adminId,
                changedByRole: "admin",
                note: reason || "Admin-initiated cancellation",
            })
        );

        // Notify customer
        await this.notificationService.notify(
            order.customerId,
            NotificationType.ORDER_CANCELLED,
            "Order Cancelled",
            `Your order #${order.orderNumber} has been cancelled. Reason: ${reason || "Administrative action"}`,
            { orderId, orderNumber: order.orderNumber }
        );

        // Notify merchant
        await this.notificationService.notify(
            order.merchantId,
            NotificationType.ORDER_CANCELLED,
            "Order Cancelled by Admin",
            `Order #${order.orderNumber} has been cancelled by admin. Reason: ${reason || "Administrative action"}`,
            { orderId, orderNumber: order.orderNumber }
        );

        orderEventsTotal.inc({ status: "cancelled", type: "admin_cancel" });
        log.info("Admin order cancellation", { orderId, adminId, reason });

        return order;
    }

    // ════════════════════════════════════════════════════════════════
    //  PRODUCTS
    // ════════════════════════════════════════════════════════════════

    async getProducts(filters: AdminProductFilters) {
        const page = filters.page || 1;
        const limit = Math.min(filters.limit || 20, 100);
        const skip = (page - 1) * limit;

        const qb = this.productRepo
            .createQueryBuilder("p")
            .leftJoinAndSelect("p.merchant", "merchant")
            .leftJoin("merchant.merchantProfile", "profile")
            .addSelect(["profile.businessName"])
            .orderBy("p.createdAt", "DESC")
            .withDeleted()
            .skip(skip)
            .take(limit);

        if (filters.merchantId) qb.andWhere("p.merchantId = :mid", { mid: filters.merchantId });
        if (filters.category) qb.andWhere("p.category = :cat", { cat: filters.category });
        if (filters.isActive !== undefined) qb.andWhere("p.isActive = :active", { active: filters.isActive });
        if (filters.search) {
            qb.andWhere("(p.name ILIKE :s OR p.description ILIKE :s)", { s: `%${filters.search}%` });
        }

        const [products, total] = await qb.getManyAndCount();

        return { products, total, page, limit };
    }

    async suspendProduct(productId: string, adminId: string) {
        const product = await this.productRepo.findOne({
            where: { id: productId },
            withDeleted: true,
        });
        if (!product) throw new Error("Product not found");

        product.isActive = false;
        await this.productRepo.save(product);

        log.info("Admin suspended product", { productId, adminId });
        return product;
    }

    async reactivateProduct(productId: string, adminId: string) {
        const product = await this.productRepo.findOne({
            where: { id: productId },
            withDeleted: true,
        });
        if (!product) throw new Error("Product not found");

        product.isActive = true;
        product.deletedAt = null; // un-soft-delete if needed
        await this.productRepo.save(product);

        log.info("Admin reactivated product", { productId, adminId });
        return product;
    }

    async deleteProduct(productId: string, adminId: string) {
        const product = await this.productRepo.findOne({ where: { id: productId } });
        if (!product) throw new Error("Product not found");

        await this.productRepo.softDelete(productId);
        log.info("Admin deleted product", { productId, adminId });
        return { message: "Product deleted" };
    }

    // ════════════════════════════════════════════════════════════════
    //  MERCHANTS
    // ════════════════════════════════════════════════════════════════

    async getMerchantDetails(merchantId: string) {
        const profile = await this.merchantProfileRepo.findOne({
            where: { userId: merchantId },
            relations: { user: true },
        });
        if (!profile) throw new Error("Merchant not found");

        const stats = await this.merchantStatsRepo.findOne({
            where: { merchantId },
        });

        const wallet = await this.walletRepo.findOne({
            where: { userId: merchantId },
        });

        const productCount = await this.productRepo.count({
            where: { merchantId },
        });

        const recentOrders = await this.orderRepo.find({
            where: { merchantId },
            order: { createdAt: "DESC" },
            take: 5,
        });

        return {
            profile,
            stats: stats || null,
            wallet: wallet
                ? {
                      balance: Number(wallet.balance),
                      currency: wallet.currency,
                  }
                : null,
            productCount,
            recentOrders,
        };
    }

    async updateMerchantRates(
        merchantId: string,
        rates: {
            commissionRate?: number;
            serviceFeeRate?: number;
            pickupFeeRate?: number;
        },
        adminId: string
    ) {
        const profile = await this.merchantProfileRepo.findOne({
            where: { userId: merchantId },
        });
        if (!profile) throw new Error("Merchant not found");

        if (rates.commissionRate !== undefined) {
            if (rates.commissionRate < 0 || rates.commissionRate > 100)
                throw new Error("commissionRate must be between 0 and 100");
            profile.commissionRate = rates.commissionRate;
        }
        if (rates.serviceFeeRate !== undefined) {
            if (rates.serviceFeeRate < 0 || rates.serviceFeeRate > 100)
                throw new Error("serviceFeeRate must be between 0 and 100");
            profile.serviceFeeRate = rates.serviceFeeRate;
        }
        if (rates.pickupFeeRate !== undefined) {
            if (rates.pickupFeeRate < 0 || rates.pickupFeeRate > 100)
                throw new Error("pickupFeeRate must be between 0 and 100");
            profile.pickupFeeRate = rates.pickupFeeRate;
        }

        await this.merchantProfileRepo.save(profile);

        log.info("Admin updated merchant rates", { merchantId, rates, adminId });
        return profile;
    }

    async suspendMerchant(merchantId: string, adminId: string, reason?: string) {
        const profile = await this.merchantProfileRepo.findOne({
            where: { userId: merchantId },
        });
        if (!profile) throw new Error("Merchant not found");

        profile.status = MerchantVerificationStatus.REJECTED;
        profile.isOpen = false;
        await this.merchantProfileRepo.save(profile);

        // Suspend the user status too
        const user = await this.userRepo.findOne({ where: { id: merchantId } });
        if (user) {
            user.status = UserStatus.SUSPENDED;
            await this.userRepo.save(user);
        }

        // Notify merchant
        await this.notificationService.notify(
            merchantId,
            NotificationType.MERCHANT_SUSPENDED,
            "Account Suspended",
            `Your merchant account has been suspended. ${reason ? `Reason: ${reason}` : "Please contact support for details."}`,
            { reason }
        );

        log.info("Admin suspended merchant", { merchantId, adminId, reason });
        return profile;
    }

    async approveMerchant(merchantId: string, adminId: string) {
        const profile = await this.merchantProfileRepo.findOne({
            where: { userId: merchantId },
        });
        if (!profile) throw new Error("Merchant not found");

        profile.status = MerchantVerificationStatus.APPROVED;
        await this.merchantProfileRepo.save(profile);

        // Approve the merchant role too
        const merchantRoles = await this.userRoleRepo.find({
            where: { userId: merchantId },
            relations: { role: true },
        });
        const merchantRole = merchantRoles.find((r) => r.role.name === RoleType.MERCHANT);
        if (merchantRole) {
            merchantRole.status = RoleStatus.APPROVED;
            await this.userRoleRepo.save(merchantRole);
        }

        // Un-suspend user if suspended
        const user = await this.userRepo.findOne({ where: { id: merchantId } });
        if (user && user.status === UserStatus.SUSPENDED) {
            user.status = UserStatus.ACTIVE;
            await this.userRepo.save(user);
        }

        // Ensure wallet exists
        await this.walletService.createWallet(merchantId, user?.country || "GH");

        // Notify merchant
        await this.notificationService.notify(
            merchantId,
            NotificationType.MERCHANT_APPROVED,
            "Merchant Account Approved! 🎉",
            "Congratulations! Your merchant account has been approved. You can now start listing products.",
            {}
        );

        log.info("Admin approved merchant", { merchantId, adminId });
        return profile;
    }

    async getMerchantOrders(merchantId: string, filters: { status?: OrderStatus; page?: number; limit?: number }) {
        const page = filters.page || 1;
        const limit = Math.min(filters.limit || 20, 100);
        const skip = (page - 1) * limit;

        const qb = this.orderRepo
            .createQueryBuilder("o")
            .leftJoinAndSelect("o.customer", "customer")
            .leftJoinAndSelect("o.driver", "driver")
            .where("o.merchantId = :merchantId", { merchantId })
            .orderBy("o.createdAt", "DESC")
            .skip(skip)
            .take(limit);

        if (filters.status) qb.andWhere("o.status = :status", { status: filters.status });

        const [orders, total] = await qb.getManyAndCount();
        return { orders, total, page, limit };
    }

    async getMerchantFinances(merchantId: string) {
        const wallet = await this.walletRepo.findOne({
            where: { userId: merchantId },
        });

        const profile = await this.merchantProfileRepo.findOne({
            where: { userId: merchantId },
        });

        const stats = await this.merchantStatsRepo.findOne({
            where: { merchantId },
        });

        // Recent transactions
        let recentTransactions: WalletTransaction[] = [];
        if (wallet) {
            recentTransactions = await this.walletTxRepo.find({
                where: { walletId: wallet.id },
                order: { createdAt: "DESC" },
                take: 20,
            });
        }

        // Pending payouts count
        const pendingPayouts = wallet
            ? await this.walletTxRepo
                  .createQueryBuilder("tx")
                  .where("tx.walletId = :wid", { wid: wallet.id })
                  .andWhere("tx.metadata->>'type' = :type", { type: "payout" })
                  .andWhere("tx.metadata->>'status' = :status", { status: "pending" })
                  .getCount()
            : 0;

        return {
            wallet: wallet
                ? { balance: Number(wallet.balance), currency: wallet.currency }
                : null,
            rates: {
                commissionRate: profile?.commissionRate,
                serviceFeeRate: profile?.serviceFeeRate,
                pickupFeeRate: profile?.pickupFeeRate,
            },
            stats: stats
                ? {
                      totalOrders: stats.totalOrders,
                      totalRevenue: Number(stats.totalRevenue),
                  }
                : null,
            pendingPayouts,
            recentTransactions,
        };
    }

    // ════════════════════════════════════════════════════════════════
    //  PAYOUTS
    // ════════════════════════════════════════════════════════════════

    async getPayouts(filters: AdminPayoutFilters) {
        const page = filters.page || 1;
        const limit = Math.min(filters.limit || 20, 100);
        const skip = (page - 1) * limit;

        const qb = this.walletTxRepo
            .createQueryBuilder("tx")
            .leftJoinAndSelect("tx.wallet", "wallet")
            .leftJoinAndSelect("wallet.user", "user")
            .where("tx.metadata->>'type' = :type", { type: "payout" })
            .orderBy("tx.createdAt", "DESC")
            .skip(skip)
            .take(limit);

        if (filters.status) {
            qb.andWhere("tx.metadata->>'status' = :status", { status: filters.status });
        }

        const [payouts, total] = await qb.getManyAndCount();

        return {
            payouts: payouts.map((tx) => ({
                id: tx.id,
                reference: tx.reference,
                amount: Number(tx.amount),
                description: tx.description,
                status: tx.metadata?.status || "unknown",
                payoutMethod: tx.metadata?.payoutMethod || "unknown",
                accountNumber: tx.metadata?.accountNumber || "unknown",
                userId: tx.wallet?.userId,
                userPhone: tx.wallet?.user?.phoneNumber,
                currency: tx.wallet?.currency,
                createdAt: tx.createdAt,
                metadata: tx.metadata,
            })),
            total,
            page,
            limit,
        };
    }

    async approvePayout(payoutId: string, adminId: string) {
        const tx = await this.walletTxRepo.findOne({
            where: { id: payoutId },
            relations: { wallet: true },
        });
        if (!tx) throw new Error("Payout not found");

        if (tx.metadata?.type !== "payout") {
            throw new Error("Transaction is not a payout request");
        }
        if (tx.metadata?.status === "completed") {
            throw new Error("Payout has already been completed");
        }
        if (tx.metadata?.status === "rejected") {
            throw new Error("Payout has already been rejected");
        }

        // Mark as completed
        tx.metadata = {
            ...tx.metadata,
            status: "completed",
            approvedBy: adminId,
            approvedAt: new Date().toISOString(),
        };
        await this.walletTxRepo.save(tx);

        // Notify merchant
        if (tx.wallet?.userId) {
            await this.notificationService.notify(
                tx.wallet.userId,
                NotificationType.PAYOUT_COMPLETED,
                "Payout Approved! 💰",
                `Your payout of ${formatCurrency(Number(tx.amount), tx.wallet.currency || "GHS")} has been approved and is being processed.`,
                { payoutId: tx.id, amount: Number(tx.amount) }
            );
        }

        log.info("Admin approved payout", { payoutId, adminId, amount: tx.amount });
        return tx;
    }

    async rejectPayout(payoutId: string, adminId: string, reason?: string) {
        const tx = await this.walletTxRepo.findOne({
            where: { id: payoutId },
            relations: { wallet: true },
        });
        if (!tx) throw new Error("Payout not found");

        if (tx.metadata?.type !== "payout") {
            throw new Error("Transaction is not a payout request");
        }
        if (tx.metadata?.status === "completed") {
            throw new Error("Cannot reject a completed payout");
        }
        if (tx.metadata?.status === "rejected") {
            throw new Error("Payout has already been rejected");
        }

        // Refund the debited amount back to wallet
        if (tx.wallet?.userId) {
            await this.walletService.credit(
                tx.wallet.userId,
                Number(tx.amount),
                `Payout rejected — refund: ${tx.reference}`,
                {
                    type: "payout_refund",
                    originalPayoutId: tx.id,
                    rejectedBy: adminId,
                    reason,
                }
            );
        }

        // Mark as rejected
        tx.metadata = {
            ...tx.metadata,
            status: "rejected",
            rejectedBy: adminId,
            rejectedAt: new Date().toISOString(),
            rejectionReason: reason,
        };
        await this.walletTxRepo.save(tx);

        // Notify merchant
        if (tx.wallet?.userId) {
            await this.notificationService.notify(
                tx.wallet.userId,
                NotificationType.PAYOUT_COMPLETED,
                "Payout Rejected",
                `Your payout request for ${formatCurrency(Number(tx.amount), tx.wallet.currency || "GHS")} was rejected. ${reason ? `Reason: ${reason}` : ""} The amount has been refunded to your wallet.`,
                { payoutId: tx.id, amount: Number(tx.amount), reason }
            );
        }

        log.info("Admin rejected payout", { payoutId, adminId, reason });
        return tx;
    }

    // ════════════════════════════════════════════════════════════════
    //  PLATFORM SETTINGS
    // ════════════════════════════════════════════════════════════════

    async getSettings() {
        const settings = await this.settingsRepo.find({
            order: { country: "ASC" },
        });
        return settings;
    }

    async updateSettings(
        country: string,
        data: Partial<{
            currency: string;
            minimumOrderValue: number;
            defaultCommissionRate: number;
            defaultServiceFeeRate: number;
            defaultPickupFeeRate: number;
            deliveryBaseFee: number;
            deliveryPerKmFee: number;
            rideCommissionRate: number;
            deliveryTotalCommissionRate: number;
            deliveryRidePortionRate: number;
            deliveryServicePortionRate: number;
            serviceCommissionRate: number;
            isActive: boolean;
        }>,
        adminId: string
    ) {
        let settings = await this.settingsRepo.findOne({ where: { country } });

        if (!settings) {
            // Create new country config
            settings = this.settingsRepo.create({ country, ...data } as PlatformSettings);
        } else {
            // Update existing
            Object.assign(settings, data);
        }

        await this.settingsRepo.save(settings);

        log.info("Admin updated platform settings", { country, data, adminId });
        return settings;
    }

    async getWallets(limit: number = 100, offset: number = 0) {
        const [wallets, total] = await this.walletRepo.findAndCount({
            relations: ["user"],
            order: { createdAt: "DESC" },
            take: limit,
            skip: offset,
        });

        return { wallets, total };
    }

    async getWalletTransactions(userId: string, limit: number = 50, offset: number = 0) {
        const wallet = await this.walletRepo.findOne({ where: { userId } });
        if (!wallet) throw new Error("Wallet not found");

        const [transactions, total] = await this.walletTxRepo.findAndCount({
            where: { walletId: wallet.id },
            order: { createdAt: "DESC" },
            take: limit,
            skip: offset,
        });

        return { transactions, total, wallet };
    }

    async getAllTransactions(limit: number = 50, offset: number = 0) {
        const [transactions, total] = await this.walletTxRepo.findAndCount({
            relations: ["wallet", "wallet.user"],
            order: { createdAt: "DESC" },
            take: limit,
            skip: offset,
        });

        return { transactions, total };
    }

    // ════════════════════════════════════════════════════════════════
    //  REPORTS
    // ════════════════════════════════════════════════════════════════

    async getRevenueReport(from: string, to: string) {
        const orders = await this.orderRepo
            .createQueryBuilder("o")
            .where("o.createdAt >= :from", { from })
            .andWhere("o.createdAt <= :to", { to })
            .andWhere("o.status NOT IN (:...exclude)", {
                exclude: [OrderStatus.CANCELLED, OrderStatus.REFUNDED],
            })
            .getMany();

        const totalOrders = orders.length;
        const totalRevenue = orders.reduce((s, o) => s + Number(o.totalAmount || 0), 0);
        const totalCommission = orders.reduce((s, o) => s + Number(o.commission || 0), 0);
        const totalServiceFees = orders.reduce((s, o) => s + Number(o.serviceFee || 0), 0);
        const totalDeliveryFees = orders.reduce((s, o) => s + Number(o.deliveryFee || 0), 0);
        const totalDiscounts = orders.reduce((s, o) => s + Number(o.discountAmount || 0), 0);
        const totalMerchantEarnings = orders.reduce((s, o) => s + Number(o.merchantEarnings || 0), 0);
        const platformRevenue = totalCommission + totalServiceFees;

        return {
            period: `${from} to ${to}`,
            totalOrders,
            totalRevenue: Math.round(totalRevenue * 100) / 100,
            totalCommission: Math.round(totalCommission * 100) / 100,
            totalServiceFees: Math.round(totalServiceFees * 100) / 100,
            totalDeliveryFees: Math.round(totalDeliveryFees * 100) / 100,
            totalDiscounts: Math.round(totalDiscounts * 100) / 100,
            totalMerchantEarnings: Math.round(totalMerchantEarnings * 100) / 100,
            platformRevenue: Math.round(platformRevenue * 100) / 100,
            currency: "GHS", // TODO: multi-currency
        } as RevenueReportResult;
    }

    async getOrderReport(from: string, to: string) {
        const orders = await this.orderRepo
            .createQueryBuilder("o")
            .where("o.createdAt >= :from", { from })
            .andWhere("o.createdAt <= :to", { to })
            .getMany();

        // Group by status
        const byStatus: Record<string, number> = {};
        const byPaymentMethod: Record<string, number> = {};
        const byDeliveryType: Record<string, number> = {};

        for (const o of orders) {
            byStatus[o.status] = (byStatus[o.status] || 0) + 1;
            byPaymentMethod[o.paymentMethod] = (byPaymentMethod[o.paymentMethod] || 0) + 1;
            byDeliveryType[o.deliveryType] = (byDeliveryType[o.deliveryType] || 0) + 1;
        }

        return {
            period: `${from} to ${to}`,
            totalOrders: orders.length,
            byStatus,
            byPaymentMethod,
            byDeliveryType,
        };
    }

    // ════════════════════════════════════════════════════════════════
    //  SUPPORT ACTIONS
    // ════════════════════════════════════════════════════════════════

    async assignDriverToOrder(orderId: string, driverId: string, adminId: string) {
        const order = await this.orderRepo.findOne({ where: { id: orderId } });
        if (!order) throw new Error("Order not found");

        if (order.deliveryType !== DeliveryType.DELIVERY) {
            throw new Error("Can only assign drivers to delivery orders");
        }

        const driver = await this.userRepo.findOne({ where: { id: driverId } });
        if (!driver) throw new Error("Driver not found");

        const fromStatus = order.status;
        order.driverId = driverId;
        order.status = OrderStatus.DRIVER_ASSIGNED;

        await this.orderRepo.save(order);

        await this.historyRepo.save(
            this.historyRepo.create({
                orderId,
                fromStatus,
                toStatus: OrderStatus.DRIVER_ASSIGNED,
                changedBy: adminId,
                changedByRole: "admin",
                note: `Admin manually assigned driver ${driverId}`,
            })
        );

        // Notify driver
        await this.notificationService.notify(
            driverId,
            NotificationType.ORDER_PLACED,
            "New Delivery Assignment",
            `You have been assigned to deliver order #${order.orderNumber}.`,
            { orderId, orderNumber: order.orderNumber }
        );

        // Notify customer
        await this.notificationService.notify(
            order.customerId,
            NotificationType.ORDER_PICKED_UP,
            "Driver Assigned! 🚗",
            `A driver has been assigned to your order #${order.orderNumber}.`,
            { orderId, orderNumber: order.orderNumber }
        );

        log.info("Admin assigned driver to order", { orderId, driverId, adminId });
        return order;
    }

    async reassignDriverToOrder(orderId: string, newDriverId: string, adminId: string) {
        const order = await this.orderRepo.findOne({ where: { id: orderId } });
        if (!order) throw new Error("Order not found");

        if (order.deliveryType !== DeliveryType.DELIVERY) {
            throw new Error("Can only reassign drivers for delivery orders");
        }

        const oldDriverId = order.driverId;
        const driver = await this.userRepo.findOne({ where: { id: newDriverId } });
        if (!driver) throw new Error("New driver not found");

        order.driverId = newDriverId;
        await this.orderRepo.save(order);

        await this.historyRepo.save(
            this.historyRepo.create({
                orderId,
                fromStatus: order.status,
                toStatus: order.status,
                changedBy: adminId,
                changedByRole: "admin",
                note: `Admin reassigned driver from ${oldDriverId || "none"} to ${newDriverId}`,
            })
        );

        // Notify new driver
        await this.notificationService.notify(
            newDriverId,
            NotificationType.ORDER_PLACED,
            "New Delivery Assignment",
            `You have been assigned to deliver order #${order.orderNumber}.`,
            { orderId, orderNumber: order.orderNumber }
        );

        // Notify old driver
        if (oldDriverId) {
            await this.notificationService.notify(
                oldDriverId,
                NotificationType.ORDER_CANCELLED,
                "Delivery Reassigned",
                `Order #${order.orderNumber} has been reassigned to another driver.`,
                { orderId, orderNumber: order.orderNumber }
            );
        }

        log.info("Admin reassigned driver", { orderId, oldDriverId, newDriverId, adminId });
        return order;
    }

    async creditUserWallet(userId: string, amount: number, reason: string, adminId: string) {
        if (amount <= 0) throw new Error("Amount must be positive");

        const user = await this.userRepo.findOne({ where: { id: userId } });
        if (!user) throw new Error("User not found");

        // Ensure wallet exists
        await this.walletService.createWallet(userId, user.country || "GH");

        const tx = await this.walletService.credit(userId, amount, reason, {
            type: "admin_credit",
            adminId,
            reason,
        });

        // Notify user
        await this.notificationService.notify(
            userId,
            NotificationType.WALLET_CREDITED,
            "Wallet Credited 💰",
            `${formatCurrency(amount, tx.wallet?.currency || user.country === "NG" ? "NGN" : "GHS")} has been added to your wallet. ${reason}`,
            { amount, reason }
        );

        log.info("Admin credited user wallet", { userId, amount, reason, adminId });
        return tx;
    }

    async debitUserWallet(userId: string, amount: number, reason: string, adminId: string) {
        if (amount <= 0) throw new Error("Amount must be positive");

        const user = await this.userRepo.findOne({ where: { id: userId } });
        if (!user) throw new Error("User not found");

        const tx = await this.walletService.debit(userId, amount, reason, {
            type: "admin_debit",
            adminId,
            reason,
        });

        // Notify user
        await this.notificationService.notify(
            userId,
            NotificationType.WALLET_DEBITED,
            "Wallet Debited",
            `${formatCurrency(amount, tx.wallet?.currency || "GHS")} has been deducted from your wallet. ${reason}`,
            { amount, reason }
        );

        log.info("Admin debited user wallet", { userId, amount, reason, adminId });
        return tx;
    }
}
