import { ProductCategory } from "../models/product";

// ═══════════════════════════════════════════════════════════════════
//  PRODUCT – Request DTOs
// ═══════════════════════════════════════════════════════════════════

/** POST /products */
export interface CreateProductBody {
    name: string;
    description?: string;
    category: ProductCategory;
    price: number;
    compareAtPrice?: number;
    stockQuantity?: number;
    stock_level?: number;
    min_stock_alert?: number;
    images?: string[];
    tags?: string[];
    preparationTimeMin?: number;
    expirationDate?: string;
    dosageInfo?: string;
    prescriptionRequired?: boolean;
    serviceDurationMin?: number;
    customizations?: CreateCustomizationBody[];
    options?: FoodOptionGroupBody[];
}

export interface FoodOptionGroupBody {
    name: string;
    items: CreateOptionBody[];
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
    serviceDurationMin?: number | null;
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
    category?: ProductCategory;
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
    category: ProductCategory;
    price: number;
    compareAtPrice: number | null;
    stockQuantity: number;
    minStockAlert: number;
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
