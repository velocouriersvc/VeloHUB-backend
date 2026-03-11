import { OrderStatus, OrderPaymentStatus, DeliveryType } from "../models/order";

// ═══════════════════════════════════════════════════════════════════
//  ADMIN – Request DTOs
// ═══════════════════════════════════════════════════════════════════

/** GET /admin/orders (query) */
export interface AdminOrdersQuery {
    status?: OrderStatus;
    merchantId?: string;
    customerId?: string;
    paymentStatus?: OrderPaymentStatus;
    deliveryType?: DeliveryType;
    from?: string;
    to?: string;
    page?: string;
    limit?: string;
}

/** PATCH /admin/orders/:id/status */
export interface AdminOverrideStatusBody {
    status: OrderStatus;
    note?: string;
}

/** POST /admin/orders/:id/refund, cancel */
export interface AdminOrderActionBody {
    reason?: string;
}

/** GET /admin/products (query) */
export interface AdminProductsQuery {
    merchantId?: string;
    category?: string;
    isActive?: string;  // "true" | "false"
    search?: string;
    page?: string;
    limit?: string;
}

/** PATCH /admin/products/:id */
export interface AdminProductActionBody {
    action: "suspend" | "reactivate";
}

/** PATCH /admin/merchants/:id/rates */
export interface AdminUpdateRatesBody {
    commissionRate?: number;
    serviceFeeRate?: number;
    pickupFeeRate?: number;
}

/** POST /admin/merchants/:id/suspend */
export interface AdminSuspendMerchantBody {
    reason?: string;
}

/** GET /admin/payouts (query) */
export interface AdminPayoutsQuery {
    status?: "pending" | "completed" | "rejected";
    page?: string;
    limit?: string;
}

/** PATCH /admin/payouts/:id/reject */
export interface AdminRejectPayoutBody {
    reason?: string;
}

/** PUT /admin/settings/:country */
export interface AdminUpdateSettingsBody {
    defaultCommissionRate?: number;
    defaultServiceFeeRate?: number;
    defaultDeliveryFeeBase?: number;
    defaultDeliveryFeePerKm?: number;
    currency?: string;
    minimumOrderValue?: number;
    maxDeliveryRadiusKm?: number;
    isActive?: boolean;
}

/** GET /admin/reports/revenue, reports/orders (query) */
export interface AdminReportQuery {
    from: string; // ISO date
    to: string;   // ISO date
}

/** POST /admin/orders/:id/assign-driver, reassign-driver */
export interface AdminAssignDriverBody {
    driverId: string;
}

/** POST /admin/users/:id/credit-wallet, debit-wallet */
export interface AdminWalletAdjustmentBody {
    amount: number;
    reason: string;
}

// ═══════════════════════════════════════════════════════════════════
//  ADMIN – Response DTOs
// ═══════════════════════════════════════════════════════════════════

export interface AdminDashboardResponse {
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

export interface RevenueReportResponse {
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

export interface OrderReportResponse {
    period: string;
    totalOrders: number;
    byStatus: Record<string, number>;
    byPaymentMethod: Record<string, number>;
    byDeliveryType: Record<string, number>;
}
