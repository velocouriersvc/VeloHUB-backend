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
    autoAcceptOrders?: boolean;
    isPublicRatings?: boolean;
    payoutSchedule?: "daily" | "weekly" | "manual";
    hours?: Record<string, OperatingHoursEntry>; // Dictionary for days
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

    // Behavioral
    autoAcceptOrders: boolean;
    isPublicRatings: boolean;
    payoutSchedule: string;
    businessType: "products" | "services";

    // Operations hours dictionary
    operatingHours: Record<string, OperatingHoursEntry>;
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
    pendingBalance: number;
    lifetimeEarnings: number;
    nextPayoutDate: string | null; // ISO Date
    currencyCode: string;
    payoutLimit: number;
    recentTransactions: WalletTransactionResponse[];
}

export interface WalletTransactionResponse {
    id: string; // transaction reference
    category: "payment" | "payout" | "refund";
    type: string; // display string
    amount: number; // signed number
    balanceAfter: number;
    status: "completed" | "processing" | "failed" | "cancelled";
    date: string; // ISO Date timestamp
    reference: string;
}

export interface PayoutResultResponse {
    message: string;
    balance: number;
    transaction: {
        reference: string;
        amount: number;
    };
}
