// ═══════════════════════════════════════════════════════════════════
//  RATING – Request DTOs
// ═══════════════════════════════════════════════════════════════════

/** POST /ratings/order */
export interface CreateOrderRatingBody {
    orderId: string;
    merchantRating: number; // 1-5
    merchantComment?: string;
    driverRating?: number;  // 1-5
    driverComment?: string;
}

// ═══════════════════════════════════════════════════════════════════
//  RATING – Response DTOs
// ═══════════════════════════════════════════════════════════════════

export interface OrderRatingResponse {
    id: string;
    orderId: string;
    merchantRating: number;
    merchantComment: string | null;
    driverRating: number | null;
    driverComment: string | null;
    createdAt: Date;
}

export interface MerchantReviewResponse {
    id: string;
    orderId: string;
    merchantRating: number;
    merchantComment: string | null;
    customerName?: string;
    createdAt: Date;
}
