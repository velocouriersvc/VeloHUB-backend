import { AppDataSource } from "../db/data-source";
import { Product } from "../models/product";
import { ProductCustomization } from "../models/product-customization";
import { CustomizationOption } from "../models/customization-option";
import { MerchantStats } from "../models/merchant-stats";
import { createServiceLogger } from "../utils/logger";
import { productViewsTotal } from "../utils/metrics";
import { In } from "typeorm";

const log = createServiceLogger("ProductService");

// ── Input Types ─────────────────────────────────────────────────────

export interface CreateProductInput {
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
    customizations?: CreateCustomizationInput[];
}

export interface UpdateProductInput {
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
    private customizationRepo = AppDataSource.getRepository(ProductCustomization);
    private optionRepo = AppDataSource.getRepository(CustomizationOption);
    private statsRepo = AppDataSource.getRepository(MerchantStats);

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

            // Create product
            const newProduct = productRepo.create({
                merchantId,
                name: input.name,
                description: input.description || null,
                category: input.category,
                price: input.price,
                compareAtPrice: input.compareAtPrice || null,
                stockQuantity: input.stockQuantity ?? 0,
                tags: input.tags || [],
                images: [],
                preparationTimeMin: input.preparationTimeMin || null,
                expirationDate: input.expirationDate ? new Date(input.expirationDate) : null,
                dosageInfo: input.dosageInfo || null,
                prescriptionRequired: input.prescriptionRequired ?? false,
                rentalDuration: input.rentalDuration as any || null,
                deposit: input.deposit || null,
            });
            const savedProduct = await productRepo.save(newProduct);

            // Create customizations + options
            if (input.customizations?.length) {
                for (const custInput of input.customizations) {
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
            productViewsTotal.inc({ category: product.category });
        }

        return product;
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

        if (params.category) {
            qb.andWhere("product.category = :category", { category: params.category });
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

        return { products, total, page, limit };
    }

    /**
     * Get all products for a specific merchant (merchant dashboard — includes inactive).
     */
    async getMerchantProducts(
        merchantId: string,
        page: number = 1,
        limit: number = 20
    ): Promise<{ products: Product[]; total: number; page: number; limit: number }> {
        return this.getProducts({ merchantId, isActive: undefined, page, limit });
    }

    // ── Update ──────────────────────────────────────────────────────

    /**
     * Update product fields (not customizations — those have separate endpoints).
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
        if (input.stockQuantity !== undefined) product.stockQuantity = input.stockQuantity;
        if (input.tags !== undefined) product.tags = input.tags;
        if (input.isActive !== undefined) product.isActive = input.isActive;
        if (input.preparationTimeMin !== undefined) product.preparationTimeMin = input.preparationTimeMin;
        if (input.expirationDate !== undefined)
            product.expirationDate = input.expirationDate ? new Date(input.expirationDate) : null;
        if (input.dosageInfo !== undefined) product.dosageInfo = input.dosageInfo;
        if (input.prescriptionRequired !== undefined)
            product.prescriptionRequired = input.prescriptionRequired;
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
     * Returns false if any item is out of stock.
     */
    async decrementStock(
        items: { productId: string; quantity: number }[]
    ): Promise<{ success: boolean; outOfStock?: string[] }> {
        const outOfStock: string[] = [];

        for (const item of items) {
            const product = await this.productRepo.findOne({
                where: { id: item.productId, isActive: true },
            });

            if (!product) {
                outOfStock.push(item.productId);
                continue;
            }

            if (product.stockQuantity < item.quantity) {
                outOfStock.push(item.productId);
                continue;
            }
        }

        if (outOfStock.length > 0) {
            return { success: false, outOfStock };
        }

        // All items in stock — decrement
        for (const item of items) {
            await this.productRepo
                .createQueryBuilder()
                .update(Product)
                .set({ stockQuantity: () => `"stockQuantity" - ${item.quantity}` })
                .where("id = :id", { id: item.productId })
                .execute();
        }

        return { success: true };
    }

    /**
     * Restore stock when an order is cancelled.
     */
    async restoreStock(items: { productId: string; quantity: number }[]): Promise<void> {
        for (const item of items) {
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
