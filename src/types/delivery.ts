import { OrderStatus } from "../models/order";

// ═══════════════════════════════════════════════════════════════════
//  DELIVERY – Request DTOs
// ═══════════════════════════════════════════════════════════════════

/** GET /driver/deliveries/available (query) */
export interface AvailableDeliveriesQuery {
    lat?: string;
    lng?: string;
    radiusKm?: string;
}

/** PATCH /driver/deliveries/:orderId/status */
export interface UpdateDeliveryStatusBody {
    status: OrderStatus; // PICKED_UP | IN_TRANSIT | DELIVERED
}

// ═══════════════════════════════════════════════════════════════════
//  DELIVERY – Response DTOs
// ═══════════════════════════════════════════════════════════════════

export interface AvailableDeliveryResponse {
    orderId: string;
    orderNumber: string;
    merchantName: string;
    merchantLat: number | null;
    merchantLng: number | null;
    deliveryAddress: string | null;
    deliveryLat: number | null;
    deliveryLng: number | null;
    estimatedDistanceKm: number | null;
    deliveryFee: number;
    itemCount: number;
    currency: string;
    createdAt: Date;
}

export interface AcceptedDeliveryResponse {
    message: string;
    order: {
        id: string;
        orderNumber: string;
        status: OrderStatus;
        merchantId: string;
        deliveryAddress: string | null;
        deliveryLat: number | null;
        deliveryLng: number | null;
        totalAmount: number;
        deliveryFee: number;
    };
}

export interface DeliveryStatusUpdateResponse {
    message: string;
    order: {
        id: string;
        orderNumber: string;
        status: OrderStatus;
        pickedUpAt: Date | null;
        deliveredAt: Date | null;
    };
}

export interface CompletedDeliveryResponse {
    message: string;
    order: {
        id: string;
        orderNumber: string;
        status: OrderStatus;
        deliveredAt: Date | null;
    };
    settlement: SettlementSummary | null;
}

export interface SettlementSummary {
    settlementType: string;
    merchantEarnings: number;
    driverEarnings: number;
    platformFee: number;
}
