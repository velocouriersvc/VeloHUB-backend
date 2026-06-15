import { Response } from "express";
import { AuthRequest } from "../middleware/role-middleware";
import { ProductService, CreateProductInput, UpdateProductInput, CreateCustomizationInput, CreateOptionInput } from "../services/product-service";
import { UploadService } from "../services/upload-service";
import { SearchService } from "../services/search-service";
import { createServiceLogger } from "../utils/logger";

const log = createServiceLogger("ProductController");

export class ProductController {
    private productService = new ProductService();
    private uploadService = new UploadService();
    private searchService = new SearchService();

    // ── Public Endpoints ────────────────────────────────────────────

    /**
     * GET /products/categories - Get available product categories.
     * Merchants may pass ?includePending=true to also receive their submitted-but-not-yet-approved categories.
     */
    getCategories = async (req: AuthRequest, res: Response) => {
        try {
            const includePending = req.query.includePending === 'true';
            const categories = await this.productService.getAvailableCategories(includePending);
            return res.status(200).json({ categories });
        } catch (error) {
            log.error("Error fetching categories", { error: (error as Error).message });
            return res.status(500).json({ message: "Internal server error" });
        }
    };

    /**
     * POST /products/categories - Merchant suggests a new category (created inactive, pending admin review).
     */
    suggestCategory = async (req: AuthRequest, res: Response) => {
        try {
            const { name, type } = req.body as { name?: string; type?: string };
            if (!name || !name.trim()) {
                return res.status(400).json({ message: "Category name is required." });
            }
            const categoryType = type === "service" ? "service" : "marketplace";
            const { category, alreadyPending } = await this.productService.suggestCategory(name.trim(), categoryType);
            const message = alreadyPending
                ? "This category is already submitted and pending review by our team."
                : "Category submitted for review. It will appear once approved by our team.";
            return res.status(201).json({ category, alreadyPending, message });
        } catch (error) {
            const msg = (error as Error).message;
            log.error("Error suggesting category", { error: msg });
            return res.status(400).json({ message: msg || "Could not submit category." });
        }
    };

    /**
     * GET /products - List/filter products (public).
     */
    getProducts = async (req: AuthRequest, res: Response) => {
        try {
            const { merchantId, category, search, page, limit, country, lat, lng, radius } = req.query;

            log.info(`[getProducts] incoming request → category="${category || ''}" search="${search || ''}" merchantId="${merchantId || ''}" country="${country || ''}" page=${page || 1} limit=${limit || 20}`);

            const result = await this.productService.getProducts({
                merchantId: merchantId as string,
                category: category as string,
                search: search as string,
                page: page ? Number(page) : undefined,
                limit: limit ? Number(limit) : undefined,
                country: country as string,
                lat: lat !== undefined ? Number(lat) : undefined,
                lng: lng !== undefined ? Number(lng) : undefined,
                radiusKm: radius !== undefined ? Number(radius) : undefined,
            });

            log.info(`[getProducts] returning ${result.products.length}/${result.total} products for category="${category || 'ALL'}"`);

            return res.status(200).json(result);
        } catch (error) {
            log.error("Error listing products", { error: (error as Error).message });
            return res.status(500).json({ message: "Internal server error" });
        }
    };

    /**
     * GET /products/:id - Get a single product with customizations (public).
     */
    getProduct = async (req: AuthRequest, res: Response) => {
        try {
            const { id } = req.params;
            const product = await this.productService.getProductById(id);

            if (!product) {
                return res.status(404).json({ message: "Product not found" });
            }

            return res.status(200).json(product);
        } catch (error) {
            log.error("Error getting product", { error: (error as Error).message });
            return res.status(500).json({ message: "Internal server error" });
        }
    };

    /**
     * GET /products/popular - Get popular products for a category.
     */
    getPopularProducts = async (req: AuthRequest, res: Response) => {
        try {
            const category = (req.query.category as string) || "food";
            const limit = req.query.limit ? Number(req.query.limit) : 5;
            const country = (req.query.country as string)?.toUpperCase();

            log.info(`[getPopularProducts] incoming request → category="${category}" limit=${limit} country="${country || ''}"`);

            const products = await this.productService.getPopularProducts(category, limit, country);

            log.info(`[getPopularProducts] returning ${products.length} popular products for category="${category}"`);

            return res.status(200).json({ products });
        } catch (error) {
            log.error("Error fetching popular products", { error: (error as Error).message });
            return res.status(500).json({ message: "Internal server error" });
        }
    };

    // ── Merchant Endpoints ──────────────────────────────────────────

    /**
     * GET /products/my - Get merchant's own products (includes inactive).
     */
    getMyProducts = async (req: AuthRequest, res: Response) => {
        try {
            const merchantId = req.user?.id;
            if (!merchantId) return res.status(401).json({ message: "User ID required" });

            const { page, limit } = req.query;
            const result = await this.productService.getMerchantProducts(
                merchantId,
                page ? Number(page) : undefined,
                limit ? Number(limit) : undefined
            );

            return res.status(200).json(result);
        } catch (error) {
            log.error("Error listing merchant products", { error: (error as Error).message });
            return res.status(500).json({ message: "Internal server error" });
        }
    };

    /**
     * POST /products - Create a new product.
     */
    createProduct = async (req: AuthRequest, res: Response) => {
        try {
            const merchantId = req.user?.id;
            if (!merchantId) return res.status(401).json({ message: "User ID required" });

            const input: CreateProductInput = req.body;

            // Validate required fields
            if (!input.name || !input.category || input.price === undefined) {
                return res.status(400).json({ message: "name, category, and price are required" });
            }

            const product = await this.productService.createProduct(merchantId, input);

            // Invalidate search cache
            await this.searchService.invalidateCache();

            return res.status(201).json(product);
        } catch (error) {
            const message = (error as Error).message || "Internal server error";
            // Category-type mismatch (and similar validation errors) are client errors, not 500s.
            if (/cannot be used for|please choose a|is required/i.test(message)) {
                return res.status(400).json({ message });
            }
            log.error("Error creating product", { error: message });
            return res.status(500).json({ message });
        }
    };

    /**
     * PUT /products/:id - Update a product.
     */
    updateProduct = async (req: AuthRequest, res: Response) => {
        try {
            const merchantId = req.user?.id;
            if (!merchantId) return res.status(401).json({ message: "User ID required" });

            const { id } = req.params;
            const input: UpdateProductInput = req.body;

            const product = await this.productService.updateProduct(id, merchantId, input);

            await this.searchService.invalidateCache();

            return res.status(200).json(product);
        } catch (error) {
            const message = (error as Error).message;
            if (message.includes("not found")) {
                return res.status(404).json({ message });
            }
            log.error("Error updating product", { error: message });
            return res.status(500).json({ message: "Internal server error" });
        }
    };

    /**
     * DELETE /products/:id - Soft-delete a product.
     */
    deleteProduct = async (req: AuthRequest, res: Response) => {
        try {
            const merchantId = req.user?.id;
            if (!merchantId) return res.status(401).json({ message: "User ID required" });

            const { id } = req.params;
            await this.productService.deleteProduct(id, merchantId);

            await this.searchService.invalidateCache();

            return res.status(200).json({ message: "Product deleted" });
        } catch (error) {
            const message = (error as Error).message;
            if (message.includes("not found")) {
                return res.status(404).json({ message });
            }
            log.error("Error deleting product", { error: message });
            return res.status(500).json({ message: "Internal server error" });
        }
    };

    // ── Image Endpoints ─────────────────────────────────────────────

    /**
     * POST /products/:id/images - Upload a product image.
     */
    uploadImage = async (req: AuthRequest, res: Response) => {
        try {
            const merchantId = req.user?.id;
            if (!merchantId) return res.status(401).json({ message: "User ID required" });

            const { id } = req.params;
            const file = req.file;

            if (!file) {
                return res.status(400).json({ message: "No file provided" });
            }

            // Upload to MinIO
            const uploadResult = await this.uploadService.uploadFile(
                file.buffer,
                file.originalname,
                file.mimetype,
                merchantId,
                "products"
            );

            // Add to product images array
            const product = await this.productService.addProductImage(id, merchantId, uploadResult.url);

            return res.status(200).json({ imageUrl: uploadResult.url, product });
        } catch (error) {
            const message = (error as Error).message;
            if (message.includes("not found")) {
                return res.status(404).json({ message });
            }
            log.error("Error uploading product image", { error: message });
            return res.status(500).json({ message: "Internal server error" });
        }
    };

    /**
     * DELETE /products/:id/images - Remove a product image.
     */
    removeImage = async (req: AuthRequest, res: Response) => {
        try {
            const merchantId = req.user?.id;
            if (!merchantId) return res.status(401).json({ message: "User ID required" });

            const { id } = req.params;
            const { imageUrl } = req.body;

            if (!imageUrl) {
                return res.status(400).json({ message: "imageUrl is required in request body" });
            }

            const product = await this.productService.removeProductImage(id, merchantId, imageUrl);

            // Delete from MinIO (fire-and-forget)
            this.uploadService.deleteFile(imageUrl).catch((err) => {
                log.warn("Failed to delete image from storage", { imageUrl, error: (err as Error).message });
            });

            return res.status(200).json(product);
        } catch (error) {
            const message = (error as Error).message;
            if (message.includes("not found")) {
                return res.status(404).json({ message });
            }
            log.error("Error removing product image", { error: message });
            return res.status(500).json({ message: "Internal server error" });
        }
    };

    // ── Customization Endpoints ─────────────────────────────────────

    /**
     * POST /products/:id/customizations - Add a customization group.
     */
    addCustomization = async (req: AuthRequest, res: Response) => {
        try {
            const merchantId = req.user?.id;
            if (!merchantId) return res.status(401).json({ message: "User ID required" });

            const { id } = req.params;
            const input: CreateCustomizationInput = req.body;

            if (!input.title || !input.options?.length) {
                return res.status(400).json({ message: "title and at least one option are required" });
            }

            const product = await this.productService.addCustomization(id, merchantId, input);
            return res.status(201).json(product);
        } catch (error) {
            const message = (error as Error).message;
            if (message.includes("not found")) {
                return res.status(404).json({ message });
            }
            log.error("Error adding customization", { error: message });
            return res.status(500).json({ message: "Internal server error" });
        }
    };

    /**
     * PUT /products/customizations/:customizationId - Update customization.
     */
    updateCustomization = async (req: AuthRequest, res: Response) => {
        try {
            const merchantId = req.user?.id;
            if (!merchantId) return res.status(401).json({ message: "User ID required" });

            const { customizationId } = req.params;
            const customization = await this.productService.updateCustomization(customizationId, merchantId, req.body);
            return res.status(200).json(customization);
        } catch (error) {
            const message = (error as Error).message;
            if (message.includes("not found")) {
                return res.status(404).json({ message });
            }
            log.error("Error updating customization", { error: message });
            return res.status(500).json({ message: "Internal server error" });
        }
    };

    /**
     * DELETE /products/customizations/:customizationId - Delete customization.
     */
    deleteCustomization = async (req: AuthRequest, res: Response) => {
        try {
            const merchantId = req.user?.id;
            if (!merchantId) return res.status(401).json({ message: "User ID required" });

            const { customizationId } = req.params;
            await this.productService.deleteCustomization(customizationId, merchantId);
            return res.status(200).json({ message: "Customization deleted" });
        } catch (error) {
            const message = (error as Error).message;
            if (message.includes("not found")) {
                return res.status(404).json({ message });
            }
            log.error("Error deleting customization", { error: message });
            return res.status(500).json({ message: "Internal server error" });
        }
    };

    // ── Option Endpoints ────────────────────────────────────────────

    /**
     * POST /products/customizations/:customizationId/options - Add an option.
     */
    addOption = async (req: AuthRequest, res: Response) => {
        try {
            const merchantId = req.user?.id;
            if (!merchantId) return res.status(401).json({ message: "User ID required" });

            const { customizationId } = req.params;
            const input: CreateOptionInput = req.body;

            if (!input.name) {
                return res.status(400).json({ message: "name is required" });
            }

            const option = await this.productService.addOption(customizationId, merchantId, input);
            return res.status(201).json(option);
        } catch (error) {
            const message = (error as Error).message;
            if (message.includes("not found")) {
                return res.status(404).json({ message });
            }
            log.error("Error adding option", { error: message });
            return res.status(500).json({ message: "Internal server error" });
        }
    };

    /**
     * PUT /products/options/:optionId - Update an option.
     */
    updateOption = async (req: AuthRequest, res: Response) => {
        try {
            const merchantId = req.user?.id;
            if (!merchantId) return res.status(401).json({ message: "User ID required" });

            const { optionId } = req.params;
            const option = await this.productService.updateOption(optionId, merchantId, req.body);
            return res.status(200).json(option);
        } catch (error) {
            const message = (error as Error).message;
            if (message.includes("not found")) {
                return res.status(404).json({ message });
            }
            log.error("Error updating option", { error: message });
            return res.status(500).json({ message: "Internal server error" });
        }
    };

    /**
     * DELETE /products/options/:optionId - Delete an option.
     */
    deleteOption = async (req: AuthRequest, res: Response) => {
        try {
            const merchantId = req.user?.id;
            if (!merchantId) return res.status(401).json({ message: "User ID required" });

            const { optionId } = req.params;
            await this.productService.deleteOption(optionId, merchantId);
            return res.status(200).json({ message: "Option deleted" });
        } catch (error) {
            const message = (error as Error).message;
            if (message.includes("not found")) {
                return res.status(404).json({ message });
            }
            log.error("Error deleting option", { error: message });
            return res.status(500).json({ message: "Internal server error" });
        }
    };

    // ── Stock Endpoints ─────────────────────────────────────────────

    /**
     * PATCH /products/stock - Bulk update stock quantities.
     */
    updateStock = async (req: AuthRequest, res: Response) => {
        try {
            const merchantId = req.user?.id;
            if (!merchantId) return res.status(401).json({ message: "User ID required" });

            const { items } = req.body;
            if (!Array.isArray(items) || items.length === 0) {
                return res.status(400).json({ message: "items array is required" });
            }

            await this.productService.updateStock(merchantId, items);
            return res.status(200).json({ message: "Stock updated", count: items.length });
        } catch (error) {
            log.error("Error updating stock", { error: (error as Error).message });
            return res.status(500).json({ message: (error as Error).message || "Internal server error" });
        }
    };
}
