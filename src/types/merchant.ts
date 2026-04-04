import { MerchantVerificationStatus } from "../models/merchant-profile";
import { OrderStatus } from "../models/order";

// ═══════════════════════════════════════════════════════════════════
//  MERCHANT – Request DTOs
// ═══════════════════════════════════════════════════════════════════

/** PUT /merchant/profile */
export interface UpdateMerchantProfileBody {
    businessName?: string;
    description?: string;
    businessEmail?: string;
    businessPhone?: string;
    address?: string;
    latitude?: number;
    longitude?: number;
    coverImageUrl?: string;
}

/** PATCH /merchant/toggle-open */
export interface ToggleOpenBody {
    isOpen: boolean;
}

/** PUT /merchant/hours */
export interface SetOperatingHoursBody {
    hours: OperatingHoursEntry[];
}

export interface OperatingHoursEntry {
    dayOfWeek: number; // 0=Sunday … 6=Saturday
    openTime: string;  // "HH:MM"
    closeTime: string; // "HH:MM"
    isClosed: boolean;
}

/** PATCH /merchant/hours/:dayOfWeek */
export interface UpdateDayHoursBody {
    openTime?: string;
    closeTime?: string;
    isClosed?: boolean;
}

/** PATCH /merchant/orders/:orderId/accept */
export interface AcceptOrderBody {
    estimatedPrepTime?: number; // minutes
}

/** PATCH /merchant/orders/:orderId/reject */
export interface RejectOrderBody {
    reason: string;
}

/** PATCH /merchant/orders/:orderId/status */
export interface UpdateOrderStatusBody {
    status: OrderStatus;
}

/** POST /merchant/orders/:orderId/verify-pickup, complete-pickup */
export interface VerifyPickupBody {
    code: string;
}

/** POST /merchant/request-payout */
export interface RequestPayoutBody {
    amount: number;
    payoutMethod: string;   // "momo" | "bank"
    accountNumber: string;
}

/** GET /merchant/orders (query) */
export interface MerchantOrdersQuery {
    status?: OrderStatus;
    page?: string;
    limit?: string;
}

// ═══════════════════════════════════════════════════════════════════
//  MERCHANT – Response DTOs
// ═══════════════════════════════════════════════════════════════════

export interface MerchantProfileResponse {
    id: string;
    userId: string;
    businessName: string;
    category: string;
    businessEmail: string | null;
    businessPhone: string | null;
    address: string;
    latitude: number | null;
    longitude: number | null;
    description: string | null;
    coverImageUrl: string | null;
    slug: string | null;
    storeLink: string;
    isOpen: boolean;
    status: MerchantVerificationStatus;
    commissionRate: number | null;
    serviceFeeRate: number | null;
    pickupFeeRate: number | null;
    createdAt: Date;
    updatedAt: Date;
}

export interface MerchantDashboardResponse {
    profile: MerchantProfileResponse;
    stats: MerchantStatsResponse | null;
    todayOrders: number;
    pendingOrders: number;
    activeOrders: number;
    completedOrders: number;
    totalSales: number;
    walletBalance: number;
    isOpen: boolean;
}

export interface MerchantStatsResponse {
    totalOrders: number;
    totalRevenue: number;
    averageRating: number;
    ratingCount: number;
    totalProducts: number;
    viewCount: number;
    conversionRate: number; // Percent %
}

export interface MerchantFinancesResponse {
    walletBalance: number;
    currency: string;
    totalEarnings: number;
    pendingSettlement: number;
    completedOrders: number;
    recentTransactions: WalletTransactionResponse[];
}

export interface WalletTransactionResponse {
    id: string;
    type: "credit" | "debit";
    amount: number;
    balanceBefore: number;
    balanceAfter: number;
    reference: string;
    description: string;
    metadata: Record<string, unknown> | null;
    createdAt: Date;
}

export interface PayoutResultResponse {
    message: string;
    balance: number;
    transaction: {
        reference: string;
        amount: number;
    };
}
