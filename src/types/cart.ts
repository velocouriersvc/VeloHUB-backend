// ═══════════════════════════════════════════════════════════════════
//  CART – Request DTOs
// ═══════════════════════════════════════════════════════════════════

/** POST /cart/add */
export interface AddToCartBody {
    productId: string;
    quantity: number;
    selectedOptions?: CartOptionSelection[];
}

export interface CartOptionSelection {
    customizationId: string;
    optionId: string;
}

/** PATCH /cart/items/:itemId */
export interface UpdateCartItemBody {
    quantity: number;
}

// ═══════════════════════════════════════════════════════════════════
//  CART – Response DTOs
// ═══════════════════════════════════════════════════════════════════

export interface CartResponse {
    id: string;
    merchantId: string | null;
    merchant: CartMerchantInfo | null;
    items: CartItemResponse[];
    subtotal: number;
    itemCount: number;
}

export interface CartMerchantInfo {
    businessName: string;
    category: string;
}

export interface CartItemResponse {
    id: string;
    productId: string;
    productName: string;
    productImage: string | null;
    quantity: number;
    unitPrice: number;
    selectedOptions: CartItemOptionResponse[];
    itemTotal: number;
}

export interface CartItemOptionResponse {
    customizationId: string;
    optionId: string;
    optionName: string;
    price: number;
}

/** Conflict response when adding from different merchant */
export interface CartConflictResponse {
    success: false;
    message: string;
    currentMerchant: string;
    newMerchant: string;
}
