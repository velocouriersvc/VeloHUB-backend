// ═══════════════════════════════════════════════════════════════════
//  PRODUCT – Request DTOs
// ═══════════════════════════════════════════════════════════════════

/** POST /products */
export interface CreateProductBody {
    name: string;
    description?: string;
    category: string;
    price: number;
    compareAtPrice?: number;
    stockQuantity?: number;
    tags?: string[];
    preparationTimeMin?: number;
    expirationDate?: string;
    dosageInfo?: string;
    prescriptionRequired?: boolean;
    rentalDuration?: string;
    deposit?: number;
    customizations?: CreateCustomizationBody[];
}

/** PUT /products/:id */
export interface UpdateProductBody {
    name?: string;
    description?: string;
    price?: number;
    compareAtPrice?: number | null;
    stockQuantity?: number;
    tags?: string[];
    isActive?: boolean;
    preparationTimeMin?: number | null;
    expirationDate?: string | null;
    dosageInfo?: string | null;
    prescriptionRequired?: boolean;
    rentalDuration?: string | null;
    deposit?: number | null;
}

/** POST /products/:id/customizations */
export interface CreateCustomizationBody {
    title: string;
    isRequired?: boolean;
    minSelections?: number;
    maxSelections?: number;
    sortOrder?: number;
    options: CreateOptionBody[];
}

/** POST /products/customizations/:id/options */
export interface CreateOptionBody {
    name: string;
    price?: number;
    isDefault?: boolean;
    sortOrder?: number;
}

/** PATCH /products/stock */
export interface StockUpdateItem {
    productId: string;
    quantity: number;
}

export interface BulkStockUpdateBody {
    items: StockUpdateItem[];
}

/** DELETE /products/:id/images */
export interface RemoveImageBody {
    imageUrl: string;
}

/** GET /products (query) */
export interface ProductListQuery {
    merchantId?: string;
    category?: string;
    search?: string;
    page?: string;
    limit?: string;
}

// ═══════════════════════════════════════════════════════════════════
//  PRODUCT – Response DTOs
// ═══════════════════════════════════════════════════════════════════

export interface ProductResponse {
    id: string;
    merchantId: string;
    name: string;
    description: string | null;
    category: string;
    price: number;
    compareAtPrice: number | null;
    stockQuantity: number;
    isActive: boolean;
    images: string[];
    tags: string[];
    preparationTimeMin: number | null;
    customizations?: CustomizationResponse[];
}

export interface CustomizationResponse {
    id: string;
    title: string;
    isRequired: boolean;
    minSelections: number;
    maxSelections: number;
    sortOrder: number;
    options: OptionResponse[];
}

export interface OptionResponse {
    id: string;
    name: string;
    price: number;
    isDefault: boolean;
    sortOrder: number;
}
