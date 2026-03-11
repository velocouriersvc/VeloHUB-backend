import { OrderStatus, OrderPaymentMethod, OrderPaymentStatus, DeliveryType, OrderCancelledBy } from "../models/order";

// ═══════════════════════════════════════════════════════════════════
//  ORDER – Request DTOs
// ═══════════════════════════════════════════════════════════════════

/** POST /marketplace/orders/quote */
export interface OrderQuoteBody {
    deliveryType: DeliveryType;
    deliveryLat?: number;
    deliveryLng?: number;
    deliveryAddress?: string;
    promoCode?: string;
}

/** POST /marketplace/orders/checkout */
export interface CheckoutBody {
    deliveryType: DeliveryType;
    deliveryAddress?: string;
    deliveryLat?: number;
    deliveryLng?: number;
    paymentMethod: OrderPaymentMethod;
    promoCode?: string;
    customerNote?: string;
    phoneNumber?: string;
}

/** POST /marketplace/orders/:id/cancel */
export interface CancelOrderBody {
    reason?: string;
}

/** GET /marketplace/orders (query) */
export interface CustomerOrdersQuery {
    status?: OrderStatus;
    page?: string;
    limit?: string;
}

// ═══════════════════════════════════════════════════════════════════
//  ORDER – Response DTOs
// ═══════════════════════════════════════════════════════════════════

/** Item snapshot stored on each order */
export interface OrderItemSnapshot {
    productId: string;
    productName: string;
    productImage: string | null;
    quantity: number;
    unitPrice: number;
    selectedOptions: SelectedOptionSnapshot[] | null;
    itemTotal: number;
}

export interface SelectedOptionSnapshot {
    customizationId: string;
    optionId: string;
    optionName: string;
    price: number;
}

/** Quote response */
export interface OrderQuoteResponse {
    subtotal: number;
    serviceFee: number;
    commission: number;
    deliveryFee: number;
    discount: number;
    totalAmount: number;
    merchantEarnings: number;
    currency: string;
    estimatedDeliveryMin: number | null;
    promoApplied: boolean;
    promoCodeId: string | null;
}

/** Checkout response */
export interface CheckoutResponse {
    message: string;
    order: {
        id: string;
        orderNumber: string;
        status: OrderStatus;
        totalAmount: number;
        paymentStatus: OrderPaymentStatus;
        pickupCode: string | null;
        deliveryType: DeliveryType;
        estimatedDeliveryMin: number | null;
    };
    payment: PaymentReference | null;
}

export interface PaymentReference {
    reference: string;
    authorizationUrl?: string;
    status: string;
}

/** Order list / detail response */
export interface OrderSummaryResponse {
    id: string;
    orderNumber: string;
    status: OrderStatus;
    paymentStatus: OrderPaymentStatus;
    deliveryType: DeliveryType;
    totalAmount: number;
    currency: string;
    createdAt: Date;
}

export interface OrderDetailResponse extends OrderSummaryResponse {
    customerId: string;
    merchantId: string;
    driverId: string | null;
    items: OrderItemSnapshot[];
    subtotal: number;
    serviceFee: number;
    commission: number;
    deliveryFee: number;
    discountAmount: number;
    merchantEarnings: number;
    paymentMethod: OrderPaymentMethod;
    deliveryAddress: string | null;
    deliveryLat: number | null;
    deliveryLng: number | null;
    pickupCode: string | null;
    cancelledBy: OrderCancelledBy | null;
    cancellationReason: string | null;
    customerNote: string | null;
    acceptedAt: Date | null;
    preparingAt: Date | null;
    readyAt: Date | null;
    pickedUpAt: Date | null;
    deliveredAt: Date | null;
    completedAt: Date | null;
    cancelledAt: Date | null;
}
