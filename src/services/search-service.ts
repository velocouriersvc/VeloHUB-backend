import { AppDataSource } from "../db/data-source";
import { Product, ProductCategory } from "../models/product";
import { MerchantProfile } from "../models/merchant-profile";
import { MerchantStats } from "../models/merchant-stats";
import { createServiceLogger } from "../utils/logger";
import { merchantSearchTotal } from "../utils/metrics";
import Redis from "ioredis";

const log = createServiceLogger("SearchService");

// Redis TTL for search cache (5 minutes)
const SEARCH_CACHE_TTL = 300;

// ── Types ───────────────────────────────────────────────────────────

export interface SearchParams {
    query?: string;
    category?: ProductCategory;
    latitude?: number;
    longitude?: number;
    radiusKm?: number;
    isOpen?: boolean;
    page?: number;
    limit?: number;
    sortBy?: "relevance" | "distance" | "rating" | "price_asc" | "price_desc";
}

export interface SearchResult {
    merchants: MerchantSearchResult[];
    products: ProductSearchResult[];
    total: { merchants: number; products: number };
    page: number;
    limit: number;
}

export interface MerchantSearchResult {
    id: string;
    businessName: string;
    category: string;
    description: string | null;
    coverImageUrl: string | null;
    address: string;
    latitude: number | null;
    longitude: number | null;
    isOpen: boolean;
    distance?: number; // km, only when lat/lng provided
    rating: number;
    ratingCount: number;
    totalProducts: number;
}

export interface ProductSearchResult {
    id: string;
    name: string;
    description: string | null;
    category: ProductCategory;
    price: number;
    compareAtPrice: number | null;
    images: string[];
    merchantId: string;
    merchantName: string;
    merchantIsOpen: boolean;
    distance?: number;
}

// ── Service ─────────────────────────────────────────────────────────

export class SearchService {
    private productRepo = AppDataSource.getRepository(Product);
    private profileRepo = AppDataSource.getRepository(MerchantProfile);
    private statsRepo = AppDataSource.getRepository(MerchantStats);
    private redis: Redis | null = null;

    constructor() {
        try {
            this.redis = new Redis({
                host: process.env.REDIS_HOST || "localhost",
                port: Number(process.env.REDIS_PORT) || 6379,
                password: process.env.REDIS_PASSWORD || undefined,
                maxRetriesPerRequest: 1,
                lazyConnect: true,
            });
            this.redis.connect().catch(() => {
                log.warn("Redis not available — search cache disabled");
                this.redis = null;
            });
        } catch {
            this.redis = null;
        }
    }

    /**
     * Unified search — returns matching merchants and products.
     */
    async search(params: SearchParams): Promise<SearchResult> {
        merchantSearchTotal.inc();

        const page = params.page || 1;
        const limit = Math.min(params.limit || 20, 50);

        // Try cache
        const cacheKey = this.buildCacheKey(params);
        if (this.redis) {
            try {
                const cached = await this.redis.get(cacheKey);
                if (cached) {
                    log.debug("Search cache hit", { cacheKey });
                    return JSON.parse(cached);
                }
            } catch {
                // Cache miss is fine
            }
        }

        // Search merchants
        const merchants = await this.searchMerchants(params, page, limit);

        // Search products
        const products = await this.searchProducts(params, page, limit);

        const result: SearchResult = {
            merchants: merchants.results,
            products: products.results,
            total: { merchants: merchants.total, products: products.total },
            page,
            limit,
        };

        // Cache result
        if (this.redis) {
            try {
                await this.redis.set(cacheKey, JSON.stringify(result), "EX", SEARCH_CACHE_TTL);
            } catch {
                // Non-blocking
            }
        }

        return result;
    }

    // ── Merchant Search ─────────────────────────────────────────────

    private async searchMerchants(
        params: SearchParams,
        page: number,
        limit: number
    ): Promise<{ results: MerchantSearchResult[]; total: number }> {
        const offset = (page - 1) * limit;

        let qb = this.profileRepo
            .createQueryBuilder("mp")
            .leftJoinAndSelect("mp.user", "user")
            .where("mp.status = :status", { status: "approved" });

        // Text search
        if (params.query) {
            qb = qb.andWhere(
                "(mp.businessName ILIKE :q OR mp.description ILIKE :q OR mp.address ILIKE :q OR mp.category ILIKE :q)",
                { q: `%${params.query}%` }
            );
        }

        // Category filter (maps product category to merchant category)
        if (params.category) {
            qb = qb.andWhere("mp.category ILIKE :cat", { cat: `%${params.category}%` });
        }

        // Open-only filter
        if (params.isOpen) {
            qb = qb.andWhere("mp.isOpen = true");
        }

        // Geo filter + distance calculation
        if (params.latitude && params.longitude) {
            const radiusKm = params.radiusKm || 10;

            // Haversine distance via SQL (returns km)
            qb = qb.addSelect(
                `(6371 * acos(
                    LEAST(1, GREATEST(-1,
                        cos(radians(:lat)) * cos(radians(mp.latitude)) *
                        cos(radians(mp.longitude) - radians(:lng)) +
                        sin(radians(:lat)) * sin(radians(mp.latitude))
                    ))
                ))`,
                "distance"
            );
            qb = qb.setParameters({ lat: params.latitude, lng: params.longitude });

            // Filter by radius
            qb = qb.andWhere(
                `(6371 * acos(
                    LEAST(1, GREATEST(-1,
                        cos(radians(:lat)) * cos(radians(mp.latitude)) *
                        cos(radians(mp.longitude) - radians(:lng)) +
                        sin(radians(:lat)) * sin(radians(mp.latitude))
                    ))
                )) <= :radius`,
                { radius: radiusKm }
            );

            // Sort by distance if no other sort specified or sortBy=distance
            if (!params.sortBy || params.sortBy === "distance") {
                qb = qb.orderBy("distance", "ASC");
            }
        }

        // Sort by rating
        if (params.sortBy === "rating") {
            qb = qb.orderBy("mp.isOpen", "DESC"); // open merchants first
        }

        const [rawResults, total] = await Promise.all([
            qb.skip(offset).take(limit).getRawAndEntities(),
            qb.getCount(),
        ]);

        // Fetch stats for all matched merchants
        const merchantIds = rawResults.entities.map((e) => e.userId);
        const allStats = merchantIds.length
            ? await this.statsRepo
                  .createQueryBuilder("s")
                  .where("s.merchantId IN (:...ids)", { ids: merchantIds })
                  .getMany()
            : [];
        const statsMap = new Map(allStats.map((s) => [s.merchantId, s]));

        const results: MerchantSearchResult[] = rawResults.entities.map((mp, i) => {
            const stats = statsMap.get(mp.userId);
            const raw = rawResults.raw[i];
            return {
                id: mp.userId,
                businessName: mp.businessName,
                category: mp.category,
                description: mp.description,
                coverImageUrl: mp.coverImageUrl,
                address: mp.address,
                latitude: mp.latitude,
                longitude: mp.longitude,
                isOpen: mp.isOpen,
                distance: raw?.distance ? Number(Number(raw.distance).toFixed(2)) : undefined,
                rating: stats ? Number(stats.averageRating) : 0,
                ratingCount: stats?.ratingCount || 0,
                totalProducts: stats?.totalProducts || 0,
            };
        });

        // Sort by rating if requested
        if (params.sortBy === "rating") {
            results.sort((a, b) => b.rating - a.rating);
        }

        return { results, total };
    }

    // ── Product Search ──────────────────────────────────────────────

    private async searchProducts(
        params: SearchParams,
        page: number,
        limit: number
    ): Promise<{ results: ProductSearchResult[]; total: number }> {
        const offset = (page - 1) * limit;

        let qb = this.productRepo
            .createQueryBuilder("p")
            .leftJoinAndSelect("p.merchant", "merchant")
            .leftJoin("merchant.merchantProfile", "mp")
            .addSelect(["mp.businessName", "mp.isOpen", "mp.latitude", "mp.longitude"])
            .where("p.isActive = true")
            .andWhere("p.deletedAt IS NULL");

        // Text search
        if (params.query) {
            qb = qb.andWhere(
                "(p.name ILIKE :q OR p.description ILIKE :q OR p.tags::text ILIKE :q)",
                { q: `%${params.query}%` }
            );
        }

        // Category filter
        if (params.category) {
            qb = qb.andWhere("p.category = :cat", { cat: params.category });
        }

        // Geo filter via merchant location
        if (params.latitude && params.longitude) {
            const radiusKm = params.radiusKm || 10;

            qb = qb.addSelect(
                `(6371 * acos(
                    LEAST(1, GREATEST(-1,
                        cos(radians(:lat)) * cos(radians(mp.latitude)) *
                        cos(radians(mp.longitude) - radians(:lng)) +
                        sin(radians(:lat)) * sin(radians(mp.latitude))
                    ))
                ))`,
                "product_distance"
            );
            qb = qb.setParameters({ lat: params.latitude, lng: params.longitude });

            qb = qb.andWhere(
                `(6371 * acos(
                    LEAST(1, GREATEST(-1,
                        cos(radians(:lat)) * cos(radians(mp.latitude)) *
                        cos(radians(mp.longitude) - radians(:lng)) +
                        sin(radians(:lat)) * sin(radians(mp.latitude))
                    ))
                )) <= :radius`,
                { radius: radiusKm }
            );
        }

        // Sorting
        switch (params.sortBy) {
            case "price_asc":
                qb = qb.orderBy("p.price", "ASC");
                break;
            case "price_desc":
                qb = qb.orderBy("p.price", "DESC");
                break;
            case "distance":
                if (params.latitude && params.longitude) {
                    qb = qb.orderBy("product_distance", "ASC");
                }
                break;
            default:
                qb = qb.orderBy("p.createdAt", "DESC");
                break;
        }

        const [rawResults, total] = await Promise.all([
            qb.skip(offset).take(limit).getRawAndEntities(),
            qb.getCount(),
        ]);

        const results: ProductSearchResult[] = rawResults.entities.map((p, i) => {
            const raw = rawResults.raw[i];
            const profile = (p.merchant as any)?.merchantProfile;
            return {
                id: p.id,
                name: p.name,
                description: p.description,
                category: p.category,
                price: Number(p.price),
                compareAtPrice: p.compareAtPrice ? Number(p.compareAtPrice) : null,
                images: p.images || [],
                merchantId: p.merchantId,
                merchantName: profile?.businessName || "Unknown",
                merchantIsOpen: profile?.isOpen ?? false,
                distance: raw?.product_distance
                    ? Number(Number(raw.product_distance).toFixed(2))
                    : undefined,
            };
        });

        return { results, total };
    }

    // ── Helpers ──────────────────────────────────────────────────────

    /**
     * Build a deterministic cache key from search params.
     */
    private buildCacheKey(params: SearchParams): string {
        const parts = [
            params.query || "",
            params.category || "",
            params.latitude?.toFixed(4) || "",
            params.longitude?.toFixed(4) || "",
            params.radiusKm || 10,
            params.isOpen ? "1" : "0",
            params.page || 1,
            params.limit || 20,
            params.sortBy || "relevance",
        ];
        return `search:${parts.join(":")}`;
    }

    /**
     * Invalidate search cache (e.g. after product/merchant update).
     */
    async invalidateCache(): Promise<void> {
        if (!this.redis) return;
        try {
            const keys = await this.redis.keys("search:*");
            if (keys.length) await this.redis.del(...keys);
            log.debug("Search cache invalidated", { keysRemoved: keys.length });
        } catch {
            // Non-blocking
        }
    }
}
