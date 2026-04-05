// ═══════════════════════════════════════════════════════════════════
//  SEARCH – Request DTOs
// ═══════════════════════════════════════════════════════════════════

export type SearchSortBy = "relevance" | "distance" | "rating" | "price_asc" | "price_desc";

/** GET /search (query) */
export interface SearchQuery {
    query?: string;
    category?: string;
    latitude?: string;
    longitude?: string;
    radiusKm?: string;
    isOpen?: string;       // "true" | "false"
    page?: string;
    limit?: string;
    sortBy?: SearchSortBy;
}

// ═══════════════════════════════════════════════════════════════════
//  SEARCH – Response DTOs
// ═══════════════════════════════════════════════════════════════════

export interface SearchResultResponse {
    merchants: MerchantSearchItem[];
    products: ProductSearchItem[];
    total: { merchants: number; products: number };
    page: number;
    limit: number;
}

export interface MerchantSearchItem {
    id: string;
    businessName: string;
    category: string;
    description: string | null;
    coverImageUrl: string | null;
    address: string;
    latitude: number | null;
    longitude: number | null;
    isOpen: boolean;
    distance?: number;
    rating: number;
    ratingCount: number;
    totalProducts: number;
}

export interface ProductSearchItem {
    id: string;
    name: string;
    description: string | null;
    category: string;
    price: number;
    compareAtPrice: number | null;
    images: string[];
    merchantId: string;
    merchantName: string;
    isActive: boolean;
}
