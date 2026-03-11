// ═══════════════════════════════════════════════════════════════════
//  PLATFORM SETTINGS – Request / Response DTOs
// ═══════════════════════════════════════════════════════════════════

export interface PlatformSettingsResponse {
    id: string;
    country: string;
    currency: string;
    minimumOrderValue: number;
    defaultCommissionRate: number;
    defaultServiceFeeRate: number;
    defaultPickupFeeRate: number;
    deliveryBaseFee: number;
    deliveryPerKmFee: number;
    isActive: boolean;
    updatedAt: Date;
}

export interface DeliveryFeeBreakdownResponse {
    deliveryFee: number;
    distanceKm: number;
    baseFee: number;
    perKmFee: number;
    estimatedDeliveryMin: number;
}
