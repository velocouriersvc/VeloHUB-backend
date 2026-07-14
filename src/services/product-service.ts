import { AppDataSource } from "../db/data-source";
import { ProductVariant } from "../models/product-variant";
import { ProductReview } from "../models/product-review";
import { Product, ProductCategory } from "../models/product";
import { ProductCategory as ProductCategoryEntity } from "../models/product-category";
import { ProductCustomization } from "../models/product-customization";
import { CustomizationOption } from "../models/customization-option";
import { MerchantStats } from "../models/merchant-stats";
import { NotificationType } from "../models/notification";
import { NotificationService } from "./notification-service";
import { createServiceLogger } from "../utils/logger";
import { rewriteToPublicAssetUrl } from "./upload-service";
import { productViewsTotal } from "../utils/metrics";
import { In } from "typeorm";
import { Order, OrderStatus } from "../models/order";

const log = createServiceLogger("ProductService");

/** Normalize a product's image URLs to the public https asset host so they load
 *  on Android (which blocks cleartext / wrong-host URLs that iOS may tolerate). */
function toPublicImages<T extends { images?: string[] | null }>(product: T): T {
    if (product && Array.isArray(product.images)) {
        product.images = product.images
            .map((u) => rewriteToPublicAssetUrl(u))
            .filter((u): u is string => !!u);
    }
    return product;
}

// ── Input Types ─────────────────────────────────────────────────────

export interface CreateProductInput {
    name: string;
    description?: string;
    category: string;
    /** Upload context: 'service' (from the Add Service form) or 'marketplace' (Add Product).
     *  Used to reject listings created under a category of the wrong type. */
    categoryType?: "service" | "marketplace";
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
    rentalDuration?: string;
    deposit?: number;
    customizations?: CreateCustomizationInput[];
    options?: CreateFoodOptionGroupInput[];
}

export interface CreateFoodOptionGroupInput {
    name: string;
    items: CreateOptionInput[];
}

export interface UpdateProductInput {
    name?: string;
    description?: string;
    price?: number;
    compareAtPrice?: number | null;
    stockQuantity?: number;
    stock_level?: number;
    min_stock_alert?: number;
    images?: string[];
    tags?: string[];
    isActive?: boolean;
    preparationTimeMin?: number | null;
    expirationDate?: string | null;
    dosageInfo?: string | null;
    prescriptionRequired?: boolean;
    serviceDurationMin?: number | null;
    rentalDuration?: string | null;
    deposit?: number | null;
}

export interface CreateCustomizationInput {
    title: string;
    isRequired?: boolean;
    minSelections?: number;
    maxSelections?: number;
    sortOrder?: number;
    options: CreateOptionInput[];
}

export interface CreateOptionInput {
    name: string;
    price?: number;
    isDefault?: boolean;
    sortOrder?: number;
}

// ── Service ─────────────────────────────────────────────────────────

export class ProductService {
    private productRepo = AppDataSource.getRepository(Product);
    private variantRepo = AppDataSource.getRepository(ProductVariant);
    private reviewRepo = AppDataSource.getRepository(ProductReview);
    private orderRepo = AppDataSource.getRepository(Order);
    private productCategoryRepo = AppDataSource.getRepository(ProductCategoryEntity);
    private customizationRepo = AppDataSource.getRepository(ProductCustomization);
    private optionRepo = AppDataSource.getRepository(CustomizationOption);
    private statsRepo = AppDataSource.getRepository(MerchantStats);
    private notificationService: NotificationService;

    constructor() {
        this.notificationService = new NotificationService();
    }

    /**
     * Return product categories from DB as source of truth.
     * @param includePending  When true (merchant screens), also returns isActive=false rows
     *                        so merchants can see their submitted-but-pending categories.
     * Falls back to enum values only when DB has zero active rows at all.
     */
    async getAvailableCategories(includePending = false): Promise<Array<{
        id: string;
        slug: string;
        name: string;
        icon: string | null;
        type: string;
        isActive: boolean;
    }>> {
        // Fetch active rows (always); also fetch inactive when merchant requests
        const activeRows = await this.productCategoryRepo.find({
            where: { isActive: true },
            order: { name: "ASC" },
        });

        const pendingRows = includePending
            ? await this.productCategoryRepo.find({ where: { isActive: false }, order: { name: "ASC" } })
            : [];

        const toDto = (c: ProductCategoryEntity) => ({
            id: c.id,
            slug: c.slug,
            name: c.name,
            icon: c.icon || null,
            type: c.type || (c.slug === ProductCategory.SERVICES ? "service" : "marketplace"),
            isActive: c.isActive,
        });

        if (activeRows.length > 0) {
            return [...activeRows.map(toDto), ...pendingRows.map(toDto)];
        }

        // Fallback to in-code enum when DB has no active categories at all
        const enumFallback = Object.values(ProductCategory).map((slug) => ({
            id: slug,
            slug,
            name: slug.charAt(0).toUpperCase() + slug.slice(1),
            icon: null,
            type: slug === ProductCategory.SERVICES ? "service" : "marketplace",
            isActive: true,
        }));

        return [...enumFallback, ...pendingRows.map(toDto)];
    }

    /**
     * Merchant-submitted category suggestion.
     * Created with isActive=false - admin must approve before it appears publicly.
     * If the category already exists but is inactive (pending review), returns it silently
     * instead of throwing so the merchant knows it is already in the queue.
     */
    async suggestCategory(name: string, type: "service" | "marketplace"): Promise<{ category: ProductCategoryEntity; alreadyPending: boolean }> {
        const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
        const existing = await this.productCategoryRepo.findOne({ where: { slug } });
        if (existing) {
            if (existing.isActive) {
                throw new Error("This category is already live on the platform.");
            }
            // Already submitted and pending admin review - silently succeed
            return { category: existing, alreadyPending: true };
        }
        const category = this.productCategoryRepo.create({ name, slug, type, isActive: false });
        await this.productCategoryRepo.save(category);
        return { category, alreadyPending: false };
    }

    // ── Create ──────────────────────────────────────────────────────

    /**
     * Create a product with optional customizations & options (one transaction).
     */
    async createProduct(merchantId: string, input: CreateProductInput): Promise<Product> {
        const product = await AppDataSource.transaction(async (manager) => {
            const productRepo = manager.getRepository(Product);
            const custRepo = manager.getRepository(ProductCustomization);
            const optRepo = manager.getRepository(CustomizationOption);
            const statsRepo = manager.getRepository(MerchantStats);

            // Ensure category exists in product_categories table.
            const catRepo = manager.getRepository(ProductCategoryEntity);
            const slug = input.category.toLowerCase().replace(/\s+/g, '-');
            const existingCat = await catRepo.findOne({ where: { slug } });

            // Normalize the expected type from the upload context (Add Service vs Add Product).
            const expectedType: "service" | "marketplace" | undefined =
                input.categoryType === "service" ? "service"
                : input.categoryType === "marketplace" ? "marketplace"
                : undefined;

            if (existingCat) {
                // Reject cross-type listings: a physical product cannot be saved under a
                // service category (or vice versa). This is what was letting blenders/toasters
                // show up under "Services".
                if (expectedType && existingCat.type && existingCat.type !== expectedType) {
                    throw new Error(
                        `Category "${input.category}" is a ${existingCat.type} category and cannot be used for a ${expectedType} listing. Please choose a ${expectedType} category.`
                    );
                }
            } else {
                // Create the category with the type from the upload context when known,
                // otherwise fall back to the slug-based heuristic.
                const categoryType = expectedType ?? (slug === ProductCategory.SERVICES ? 'service' : 'marketplace');
                const newCat = catRepo.create({
                    name: input.category,
                    slug,
                    type: categoryType,
                    isActive: true
                });
                await catRepo.save(newCat);
                log.info("Auto-created new category", { category: input.category, type: categoryType });
            }

            // Create product
            const newProduct = productRepo.create({
                merchantId,
                name: input.name,
                description: input.description || null,
                category: input.category,
                price: input.price,
                compareAtPrice: input.compareAtPrice || null,
                stockQuantity: input.stock_level ?? input.stockQuantity ?? 0,
                minStockAlert: input.min_stock_alert ?? 0,
                tags: input.tags || [],
                images: input.images || [],
                preparationTimeMin: input.preparationTimeMin || null,
                expirationDate: input.expirationDate ? new Date(input.expirationDate) : null,
                dosageInfo: input.dosageInfo || null,
                prescriptionRequired: input.prescriptionRequired ?? false,
                serviceDurationMin: input.serviceDurationMin || null,
                rentalDuration: input.rentalDuration as any || null,
                deposit: input.deposit || null,
            });
            const savedProduct = await productRepo.save(newProduct);

            // Map 'options' alias to 'customizations' if provided (standard for food category)
            const customizations = input.customizations || (input.options?.length ? input.options.map(g => ({
                title: g.name,
                options: g.items,
                isRequired: false,
                minSelections: 0,
                maxSelections: 1,
                sortOrder: 0
            })) : []);

            // Create customizations + options
            if (customizations.length) {
                for (const custInput of customizations) {
                    const customization = custRepo.create({
                        productId: savedProduct.id,
                        title: custInput.title,
                        isRequired: custInput.isRequired ?? false,
                        minSelections: custInput.minSelections ?? 0,
                        maxSelections: custInput.maxSelections ?? 1,
                        sortOrder: custInput.sortOrder ?? 0,
                    });
                    const savedCust = await custRepo.save(customization);

                    if (custInput.options?.length) {
                        const options = custInput.options.map((opt) =>
                            optRepo.create({
                                customizationId: savedCust.id,
                                name: opt.name,
                                price: opt.price ?? 0,
                                isDefault: opt.isDefault ?? false,
                                sortOrder: opt.sortOrder ?? 0,
                            })
                        );
                        await optRepo.save(options);
                    }
                }
            }

            // Increment merchant stats product count
            const stats = await statsRepo.findOne({ where: { merchantId } });
            if (stats) {
                stats.totalProducts = Math.max(0, stats.totalProducts + 1);
                await statsRepo.save(stats);
            } else {
                const newStats = statsRepo.create({
                    merchantId,
                    totalProducts: 1,
                });
                await statsRepo.save(newStats);
            }

            log.info("Product created", { productId: savedProduct.id, merchantId });
            return savedProduct;
        });

        return (await this.getProductById(product.id))!;
    }

    // ── Read ────────────────────────────────────────────────────────

    /**
     * Get a single product with customizations + options + merchant info.
     */
    async getProductById(productId: string): Promise<Product | null> {
        const product = await this.productRepo.findOne({
            where: { id: productId },
            relations: {
                customizations: { options: true },
                merchant: { merchantProfile: true },
            },
            order: {
                customizations: { sortOrder: "ASC", options: { sortOrder: "ASC" } },
            },
        });

        if (product) {
            productViewsTotal.inc({ category: product.category || "unknown" });
            // Attach active variants (color/size SKUs) so the PDP can render selectors.
            (product as any).variants = await this.variantRepo.find({
                where: { productId, isActive: true },
                order: { createdAt: "ASC" },
            });
            (product as any).reviewSummary = await this.getReviewSummary(productId);
            return toPublicImages(product);
        }

        return product;
    }

    // ── Variants (color/size SKUs) ──────────────────────────────────

    async getVariants(productId: string) {
        return this.variantRepo.find({ where: { productId }, order: { createdAt: "ASC" } });
    }

    async createVariant(merchantId: string, productId: string, input: { color?: string; size?: string; stockQuantity?: number; priceDelta?: number; imageUrl?: string }) {
        const product = await this.productRepo.findOne({ where: { id: productId, merchantId } });
        if (!product) throw new Error("Product not found");
        const variant = this.variantRepo.create({
            productId,
            color: input.color || null,
            size: input.size || null,
            stockQuantity: input.stockQuantity ?? 0,
            priceDelta: input.priceDelta ?? 0,
            imageUrl: input.imageUrl || null,
        });
        return this.variantRepo.save(variant);
    }

    async updateVariant(merchantId: string, variantId: string, input: Partial<{ color: string; size: string; stockQuantity: number; priceDelta: number; imageUrl: string; isActive: boolean }>) {
        const variant = await this.variantRepo.findOne({ where: { id: variantId }, relations: { product: true } });
        if (!variant || variant.product.merchantId !== merchantId) throw new Error("Variant not found");
        Object.assign(variant, input);
        return this.variantRepo.save(variant);
    }

    async deleteVariant(merchantId: string, variantId: string) {
        const variant = await this.variantRepo.findOne({ where: { id: variantId }, relations: { product: true } });
        if (!variant || variant.product.merchantId !== merchantId) throw new Error("Variant not found");
        await this.variantRepo.remove(variant);
    }

    // ── Reviews ─────────────────────────────────────────────────────

    /** Aggregate rating + count for a product (for the PDP summary). */
    async getReviewSummary(productId: string): Promise<{ average: number; count: number }> {
        const row = await this.reviewRepo.createQueryBuilder("r")
            .select("AVG(r.rating)", "avg").addSelect("COUNT(*)", "count")
            .where("r.productId = :productId", { productId })
            .getRawOne();
        return { average: Math.round((Number(row?.avg) || 0) * 10) / 10, count: Number(row?.count) || 0 };
    }

    async getReviews(productId: string, filters: { rating?: number; variant?: string } = {}) {
        const qb = this.reviewRepo.createQueryBuilder("r")
            .leftJoinAndSelect("r.user", "user")
            .where("r.productId = :productId", { productId })
            .orderBy("r.createdAt", "DESC");
        if (filters.rating) qb.andWhere("r.rating = :rating", { rating: filters.rating });
        if (filters.variant) qb.andWhere("r.variantLabel ILIKE :variant", { variant: `%${filters.variant}%` });
        const reviews = await qb.getMany();
        const summary = await this.getReviewSummary(productId);
        return { reviews, summary };
    }

    /** Create a review. Only valid for a delivered/completed order that contained the product. */
    async createReview(userId: string, productId: string, input: { orderId: string; rating: number; comment?: string }) {
        if (!input.rating || input.rating < 1 || input.rating > 5) throw new Error("Rating must be 1-5");
        const order = await this.orderRepo.findOne({ where: { id: input.orderId, customerId: userId } });
        if (!order) throw new Error("Order not found");
        if (![OrderStatus.DELIVERED, OrderStatus.COMPLETED].includes(order.status)) {
            throw new Error("You can only review items from a completed order");
        }
        const line = (order.items || []).find((i: any) => i.productId === productId);
        if (!line) throw new Error("This order does not contain that product");

        const existing = await this.reviewRepo.findOne({ where: { productId, userId, orderId: input.orderId } });
        if (existing) throw new Error("You already reviewed this item for this order");

        const review = this.reviewRepo.create({
            productId, userId, orderId: input.orderId,
            rating: input.rating, comment: input.comment || null,
            variantLabel: (line as any).variantLabel || null,
        });
        return this.reviewRepo.save(review);
    }

    /**
     * Resolve a category param: if it matches a category type (food, grocery, pharmacy, etc.)
     * return all sub-category slugs under that type. Otherwise return the slug as-is.
     */
    private async resolveCategorySlugs(category: string): Promise<{ slugs: string[]; isType: boolean }> {
        // Known category types - check if the param is a type rather than a slug
        const CATEGORY_TYPES = ["food", "grocery", "pharmacy", "marketplace", "service", "product"];
        const lower = category.toLowerCase();

        if (CATEGORY_TYPES.includes(lower)) {
            const rows = await this.productCategoryRepo.find({
                where: { type: lower, isActive: true },
                select: ["slug"],
            });
            const slugs = rows.map((r) => r.slug);
            log.info(`[resolveCategorySlugs] type="${lower}" resolved to ${slugs.length} slugs: [${slugs.join(", ")}]`);
            if (slugs.length > 0) {
                return { slugs, isType: true };
            }
            // If no sub-categories found for this type, fall through to exact match
            log.warn(`[resolveCategorySlugs] type="${lower}" has 0 sub-categories, falling back to exact match`);
        }

        return { slugs: [category], isType: false };
    }

    /**
     * List products with filtering, pagination, and optional merchant scope.
     */
    async getProducts(params: {
        merchantId?: string;
        category?: string;
        search?: string;
        isActive?: boolean;
        page?: number;
        limit?: number;
        country?: string;
        /** Buyer location - when provided with radiusKm, only return products from
         *  merchants within that distance (Haversine). Used to enforce the local
         *  delivery radius (e.g. 20km) so buyers don't see far-away listings. */
        lat?: number;
        lng?: number;
        radiusKm?: number;
    }): Promise<{ products: Product[]; total: number; page: number; limit: number }> {
        const page = params.page || 1;
        const limit = Math.min(params.limit || 20, 50);
        const offset = (page - 1) * limit;

        const qb = this.productRepo
            .createQueryBuilder("product")
            .leftJoinAndSelect("product.customizations", "customization")
            .leftJoinAndSelect("customization.options", "option")
            .leftJoinAndSelect("product.merchant", "merchant")
            .leftJoinAndSelect("merchant.merchantProfile", "merchantProfile")
            .where("product.deletedAt IS NULL");

        // Active filter (default: only active for public, all for merchant)
        if (params.isActive !== undefined) {
            qb.andWhere("product.isActive = :isActive", { isActive: params.isActive });
        } else {
            qb.andWhere("product.isActive = true");
        }

        if (params.merchantId) {
            qb.andWhere("product.merchantId = :merchantId", { merchantId: params.merchantId });
        }

        if (params.country) {
            qb.andWhere("merchant.country = :country", { country: params.country });
        }

        // Local-radius filter: only products whose merchant is within radiusKm of the
        // buyer. Haversine in SQL; LEAST(1, …) guards acos() against float rounding > 1.
        if (
            params.lat != null && !Number.isNaN(params.lat) &&
            params.lng != null && !Number.isNaN(params.lng) &&
            params.radiusKm != null && params.radiusKm > 0
        ) {
            qb.andWhere('"merchantProfile"."latitude" IS NOT NULL')
                .andWhere('"merchantProfile"."longitude" IS NOT NULL')
                .andWhere(
                    `(6371 * acos(LEAST(1,
                        cos(radians(:userLat)) * cos(radians("merchantProfile"."latitude")) *
                        cos(radians("merchantProfile"."longitude") - radians(:userLng)) +
                        sin(radians(:userLat)) * sin(radians("merchantProfile"."latitude"))
                    ))) <= :radiusKm`,
                    { userLat: params.lat, userLng: params.lng, radiusKm: params.radiusKm }
                );
        }

        if (params.category) {
            const { slugs, isType } = await this.resolveCategorySlugs(params.category);
            if (slugs.length === 1) {
                qb.andWhere("product.category = :category", { category: slugs[0] });
            } else {
                qb.andWhere("product.category IN (:...categorySlugs)", { categorySlugs: slugs });
            }
            log.info(`[getProducts] category="${params.category}" isType=${isType} → filtering by slugs: [${slugs.join(", ")}]`);
        }

        if (params.search) {
            qb.andWhere(
                "(product.name ILIKE :search OR product.description ILIKE :search OR product.tags::text ILIKE :search)",
                { search: `%${params.search}%` }
            );
        }

        qb.orderBy("product.createdAt", "DESC")
            .addOrderBy("customization.sortOrder", "ASC")
            .addOrderBy("option.sortOrder", "ASC");

        const [products, total] = await qb.skip(offset).take(limit).getManyAndCount();

        log.info(`[getProducts] category="${params.category || 'ALL'}" search="${params.search || ''}" → ${total} total, returning ${products.length}`);

        return { products: products.map(toPublicImages), total, page, limit };
    }

    /**
     * Get all products for a specific merchant (merchant dashboard - includes inactive).
     */
    async getMerchantProducts(
        merchantId: string,
        page: number = 1,
        limit: number = 20
    ): Promise<{ products: Product[]; total: number; page: number; limit: number }> {
        return this.getProducts({ merchantId, isActive: undefined, page, limit });
    }

    /**
     * Get popular products for a specific merchant based on order frequency (merchant dashboard).
     */
    async getMerchantPopularProducts(
        merchantId: string,
        page: number = 1,
        limit: number = 10
    ): Promise<{ products: Product[]; total: number; page: number; limit: number }> {
        const subquery = AppDataSource.getRepository(Order)
            .createQueryBuilder("order")
            .select("oi.productId")
            .addSelect("COUNT(*)", "orderCount")
            .innerJoin("order.orderItems", "oi")
            .where("order.merchantId = :merchantId", { merchantId })
            .andWhere("order.status IN (:...statuses)", { statuses: [OrderStatus.COMPLETED, OrderStatus.DELIVERED] })
            .groupBy("oi.productId");

        const qb = this.productRepo
            .createQueryBuilder("product")
            .leftJoinAndSelect("product.customizations", "customization")
            .leftJoinAndSelect("customization.options", "option")
            .leftJoinAndSelect("product.merchant", "merchant")
            .leftJoinAndSelect("merchant.merchantProfile", "merchantProfile")
            .where("product.deletedAt IS NULL")
            .andWhere("product.id IN (" + subquery.getQuery() + ")")
            .setParameters(subquery.getParameters())
            .orderBy("orderCount", "DESC")
            .addOrderBy("product.createdAt", "DESC");

        const [products, total] = await qb.skip((page - 1) * limit).take(limit).getManyAndCount();
        return { products: products.map(toPublicImages), total, page, limit };
    }

    /**
     * Get popular products for a given category based on historical orders.
     */
    async getPopularProducts(category: string = "food", limit: number = 5, country?: string): Promise<Product[]> {
        const safeLimit = Math.min(Math.max(limit || 1, 1), 20);

        // Resolve category type to slugs (e.g. "food" → ["burgers", "pizza", ...])
        const { slugs } = await this.resolveCategorySlugs(category);
        log.info(`[getPopularProducts] category="${category}" resolved to slugs: [${slugs.join(", ")}]`);

        // Build the category filter: single slug = $1 exact match, multiple = ANY($1)
        const categoryFilter = slugs.length === 1
            ? "AND p.category = $1"
            : "AND p.category = ANY($1)";
        const categoryParam = slugs.length === 1 ? slugs[0] : slugs;

        const countryFilter = country ? "AND m.country = $5" : "";
        const params: any[] = [categoryParam, OrderStatus.CANCELLED, OrderStatus.REFUNDED, safeLimit];
        if (country) params.push(country.toUpperCase());

        const rows = await AppDataSource.query(
            `
            SELECT
                p.id,
                p.name,
                p.description,
                p.category,
                p.price,
                p.images,
                p.merchant_id AS "merchantId",
                p.stock_quantity AS "stockQuantity",
                p.min_stock_alert AS "minStockAlert",
                p.is_active AS "isActive",
                p.preparation_time_min AS "preparationTimeMin",
                p.expiration_date AS "expirationDate",
                p.dosage_info AS "dosageInfo",
                p.prescription_required AS "prescriptionRequired",
                p.service_duration_min AS "serviceDurationMin",
                p.rental_duration AS "rentalDuration",
                p.deposit AS "deposit",
                p.created_at AS "createdAt",
                p.updated_at AS "updatedAt"
            FROM products p
            INNER JOIN users m ON m.id = p.merchant_id
            INNER JOIN LATERAL (
                SELECT SUM((item->>'quantity')::int) AS popularity
                FROM orders o,
                     jsonb_array_elements(o.items) AS item
                WHERE (item->>'productId')::uuid = p.id
                  AND o.status NOT IN ($2, $3)
            ) pop ON pop.popularity IS NOT NULL
            WHERE p.deleted_at IS NULL
              AND p.is_active = true
              ${categoryFilter}
              ${countryFilter}
            ORDER BY pop.popularity DESC
            LIMIT $4
            `,
            params
        );

        log.info(`[getPopularProducts] category="${category}" country="${country || 'ALL'}" → ${rows.length} popular products found`);

        return rows.map((row: any) => ({
            ...row,
            price: typeof row.price === 'string' ? Number(row.price) : row.price,
            images: (row.images || []).map((u: string) => rewriteToPublicAssetUrl(u)).filter(Boolean),
        }));
    }

    // ── Update ──────────────────────────────────────────────────────

    /**
     * Update product fields (not customizations - those have separate endpoints).
     */
    async updateProduct(
        productId: string,
        merchantId: string,
        input: UpdateProductInput
    ): Promise<Product> {
        const product = await this.productRepo.findOne({
            where: { id: productId, merchantId },
        });

        if (!product) {
            throw new Error("Product not found or you don't own this product");
        }

        // Merge only provided fields
        if (input.name !== undefined) product.name = input.name;
        if (input.description !== undefined) product.description = input.description || null;
        if (input.price !== undefined) product.price = input.price;
        if (input.compareAtPrice !== undefined) product.compareAtPrice = input.compareAtPrice;
        if (input.stock_level !== undefined) product.stockQuantity = input.stock_level;
        if (input.stockQuantity !== undefined) product.stockQuantity = input.stockQuantity;
        if (input.min_stock_alert !== undefined) product.minStockAlert = input.min_stock_alert;
        if (input.images !== undefined) product.images = input.images;
        if (input.tags !== undefined) product.tags = input.tags;
        if (input.isActive !== undefined) product.isActive = input.isActive;
        if (input.preparationTimeMin !== undefined) product.preparationTimeMin = input.preparationTimeMin;
        if (input.expirationDate !== undefined)
            product.expirationDate = input.expirationDate ? new Date(input.expirationDate) : null;
        if (input.dosageInfo !== undefined) product.dosageInfo = input.dosageInfo;
        if (input.prescriptionRequired !== undefined)
            product.prescriptionRequired = input.prescriptionRequired;
        if (input.serviceDurationMin !== undefined) product.serviceDurationMin = input.serviceDurationMin;
        if (input.rentalDuration !== undefined) product.rentalDuration = input.rentalDuration as any;
        if (input.deposit !== undefined) product.deposit = input.deposit;

        await this.productRepo.save(product);
        log.info("Product updated", { productId, merchantId });

        return this.getProductById(productId) as Promise<Product>;
    }

    // ── Delete (soft) ───────────────────────────────────────────────

    /**
     * Soft-delete a product.
     */
    async deleteProduct(productId: string, merchantId: string): Promise<void> {
        const product = await this.productRepo.findOne({
            where: { id: productId, merchantId },
        });

        if (!product) {
            throw new Error("Product not found or you don't own this product");
        }

        await this.productRepo.softDelete(productId);
        await this.incrementProductCount(merchantId, -1);

        log.info("Product soft-deleted", { productId, merchantId });
    }

    // ── Images ──────────────────────────────────────────────────────

    /**
     * Add an image URL to a product's images array.
     */
    async addProductImage(productId: string, merchantId: string, imageUrl: string): Promise<Product> {
        const product = await this.productRepo.findOne({
            where: { id: productId, merchantId },
        });

        if (!product) {
            throw new Error("Product not found or you don't own this product");
        }

        product.images = [...product.images, imageUrl];
        await this.productRepo.save(product);

        log.info("Product image added", { productId, imageCount: product.images.length });
        return this.getProductById(productId) as Promise<Product>;
    }

    /**
     * Remove an image URL from a product's images array.
     */
    async removeProductImage(productId: string, merchantId: string, imageUrl: string): Promise<Product> {
        const product = await this.productRepo.findOne({
            where: { id: productId, merchantId },
        });

        if (!product) {
            throw new Error("Product not found or you don't own this product");
        }

        product.images = product.images.filter((img) => img !== imageUrl);
        await this.productRepo.save(product);

        log.info("Product image removed", { productId, imageCount: product.images.length });
        return this.getProductById(productId) as Promise<Product>;
    }

    // ── Customizations ──────────────────────────────────────────────

    /**
     * Add a customization group (with options) to a product.
     */
    async addCustomization(
        productId: string,
        merchantId: string,
        input: CreateCustomizationInput
    ): Promise<Product> {
        // Verify ownership
        const product = await this.productRepo.findOne({
            where: { id: productId, merchantId },
        });
        if (!product) throw new Error("Product not found or you don't own this product");

        const customization = this.customizationRepo.create({
            productId,
            title: input.title,
            isRequired: input.isRequired ?? false,
            minSelections: input.minSelections ?? 0,
            maxSelections: input.maxSelections ?? 1,
            sortOrder: input.sortOrder ?? 0,
        });
        const savedCust = await this.customizationRepo.save(customization);

        if (input.options?.length) {
            const options = input.options.map((opt) =>
                this.optionRepo.create({
                    customizationId: savedCust.id,
                    name: opt.name,
                    price: opt.price ?? 0,
                    isDefault: opt.isDefault ?? false,
                    sortOrder: opt.sortOrder ?? 0,
                })
            );
            await this.optionRepo.save(options);
        }

        log.info("Customization added", { productId, customizationId: savedCust.id });
        return this.getProductById(productId) as Promise<Product>;
    }

    /**
     * Update a customization group.
     */
    async updateCustomization(
        customizationId: string,
        merchantId: string,
        input: Partial<CreateCustomizationInput>
    ): Promise<ProductCustomization> {
        const customization = await this.customizationRepo.findOne({
            where: { id: customizationId },
            relations: { product: true },
        });

        if (!customization || customization.product.merchantId !== merchantId) {
            throw new Error("Customization not found or you don't own this product");
        }

        if (input.title !== undefined) customization.title = input.title;
        if (input.isRequired !== undefined) customization.isRequired = input.isRequired;
        if (input.minSelections !== undefined) customization.minSelections = input.minSelections;
        if (input.maxSelections !== undefined) customization.maxSelections = input.maxSelections;
        if (input.sortOrder !== undefined) customization.sortOrder = input.sortOrder;

        return this.customizationRepo.save(customization);
    }

    /**
     * Delete a customization group (cascades to options).
     */
    async deleteCustomization(customizationId: string, merchantId: string): Promise<void> {
        const customization = await this.customizationRepo.findOne({
            where: { id: customizationId },
            relations: { product: true },
        });

        if (!customization || customization.product.merchantId !== merchantId) {
            throw new Error("Customization not found or you don't own this product");
        }

        await this.customizationRepo.delete(customizationId);
        log.info("Customization deleted", { customizationId });
    }

    // ── Options ─────────────────────────────────────────────────────

    /**
     * Add an option to a customization group.
     */
    async addOption(
        customizationId: string,
        merchantId: string,
        input: CreateOptionInput
    ): Promise<CustomizationOption> {
        const customization = await this.customizationRepo.findOne({
            where: { id: customizationId },
            relations: { product: true },
        });

        if (!customization || customization.product.merchantId !== merchantId) {
            throw new Error("Customization not found or you don't own this product");
        }

        const option = this.optionRepo.create({
            customizationId,
            name: input.name,
            price: input.price ?? 0,
            isDefault: input.isDefault ?? false,
            sortOrder: input.sortOrder ?? 0,
        });

        return this.optionRepo.save(option);
    }

    /**
     * Update an option.
     */
    async updateOption(
        optionId: string,
        merchantId: string,
        input: Partial<CreateOptionInput>
    ): Promise<CustomizationOption> {
        const option = await this.optionRepo.findOne({
            where: { id: optionId },
            relations: { customization: { product: true } },
        });

        if (!option || option.customization.product.merchantId !== merchantId) {
            throw new Error("Option not found or you don't own this product");
        }

        if (input.name !== undefined) option.name = input.name;
        if (input.price !== undefined) option.price = input.price;
        if (input.isDefault !== undefined) option.isDefault = input.isDefault;
        if (input.sortOrder !== undefined) option.sortOrder = input.sortOrder;

        return this.optionRepo.save(option);
    }

    /**
     * Delete an option.
     */
    async deleteOption(optionId: string, merchantId: string): Promise<void> {
        const option = await this.optionRepo.findOne({
            where: { id: optionId },
            relations: { customization: { product: true } },
        });

        if (!option || option.customization.product.merchantId !== merchantId) {
            throw new Error("Option not found or you don't own this product");
        }

        await this.optionRepo.delete(optionId);
    }

    // ── Stock Management ────────────────────────────────────────────

    /**
     * Bulk-update stock quantities (e.g. after daily stock count).
     */
    async updateStock(
        merchantId: string,
        items: { productId: string; stockQuantity: number }[]
    ): Promise<void> {
        const productIds = items.map((i) => i.productId);
        const products = await this.productRepo.find({
            where: { id: In(productIds), merchantId },
        });

        if (products.length !== items.length) {
            throw new Error("One or more products not found or not owned by you");
        }

        for (const item of items) {
            await this.productRepo.update(
                { id: item.productId, merchantId },
                { stockQuantity: item.stockQuantity }
            );
        }

        log.info("Stock updated", { merchantId, itemCount: items.length });
    }

    /**
     * Decrement stock for ordered items (called during checkout).
     * When an item carries a variantId, the variant's stock is used instead of
     * the product's. Returns false if any item is out of stock.
     */
    async decrementStock(
        items: { productId: string; quantity: number; variantId?: string | null }[]
    ): Promise<{ success: boolean; outOfStock?: string[] }> {
        const outOfStock: string[] = [];

        for (const item of items) {
            if (item.variantId) {
                const variant = await this.variantRepo.findOne({ where: { id: item.variantId, isActive: true } });
                if (!variant || variant.stockQuantity < item.quantity) outOfStock.push(item.productId);
                continue;
            }
            const product = await this.productRepo.findOne({
                where: { id: item.productId, isActive: true },
            });

            if (!product || product.stockQuantity < item.quantity) {
                outOfStock.push(item.productId);
                continue;
            }
        }

        if (outOfStock.length > 0) {
            return { success: false, outOfStock };
        }

        // All items in stock - decrement
        for (const item of items) {
            if (item.variantId) {
                await this.variantRepo.decrement({ id: item.variantId }, "stockQuantity", item.quantity);
                continue;
            }
            const product = await this.productRepo.findOne({ where: { id: item.productId } });
            if (!product) continue;

            const newQuantity = product.stockQuantity - item.quantity;

            await this.productRepo.update(
                { id: item.productId },
                { stockQuantity: newQuantity }
            );

            // Check for low stock alert
            if (newQuantity <= product.minStockAlert && product.minStockAlert > 0) {
                await this.notificationService.notify(
                    product.merchantId,
                    NotificationType.LOW_STOCK_ALERT,
                    "Low Stock Alert! ⚠️",
                    `${product.name} has only ${newQuantity} left. Restock soon!`,
                    { productId: product.id, stockLevel: newQuantity }
                );
            }
        }

        return { success: true };
    }

    /**
     * Restore stock when an order is cancelled.
     */
    async restoreStock(items: { productId: string; quantity: number; variantId?: string | null }[]): Promise<void> {
        for (const item of items) {
            if (item.variantId) {
                await this.variantRepo.increment({ id: item.variantId }, "stockQuantity", item.quantity);
                continue;
            }
            await this.productRepo
                .createQueryBuilder()
                .update(Product)
                .set({ stockQuantity: () => `"stockQuantity" + ${item.quantity}` })
                .where("id = :id", { id: item.productId })
                .execute();
        }
    }

    // ── Helpers ──────────────────────────────────────────────────────

    private async incrementProductCount(merchantId: string, delta: number): Promise<void> {
        const stats = await this.statsRepo.findOne({ where: { merchantId } });
        if (stats) {
            stats.totalProducts = Math.max(0, stats.totalProducts + delta);
            await this.statsRepo.save(stats);
        } else {
            // Create stats row if missing
            const newStats = this.statsRepo.create({
                merchantId,
                totalProducts: Math.max(0, delta),
            });
            await this.statsRepo.save(newStats);
        }
    }
}
