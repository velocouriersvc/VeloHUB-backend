import { Response } from "express";
import { AuthRequest } from "../middleware/role-middleware";
import { ProductService, CreateProductInput, UpdateProductInput, CreateCustomizationInput, CreateOptionInput } from "../services/product-service";
import { UploadService } from "../services/upload-service";
import { SearchService } from "../services/search-service";
import { ProductCategory } from "../models/product";
import { createServiceLogger } from "../utils/logger";

const log = createServiceLogger("ProductController");

export class ProductController {
    private productService = new ProductService();
    private uploadService = new UploadService();
    private searchService = new SearchService();

    // ── Public Endpoints ────────────────────────────────────────────

    /**
     * GET /products — List/filter products (public).
     */
    getProducts = async (req: AuthRequest, res: Response) => {
        try {
            const { merchantId, category, search, page, limit } = req.query;

            const result = await this.productService.getProducts({
                merchantId: merchantId as string,
                category: category as ProductCategory,
                search: search as string,
                page: page ? Number(page) : undefined,
                limit: limit ? Number(limit) : undefined,
            });

            return res.status(200).json(result);
        } catch (error) {
            log.error("Error listing products", { error: (error as Error).message });
            return res.status(500).json({ message: "Internal server error" });
        }
    };

    /**
     * GET /products/:id — Get a single product with customizations (public).
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

    // ── Merchant Endpoints ──────────────────────────────────────────

    /**
     * GET /products/my — Get merchant's own products (includes inactive).
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
     * POST /products — Create a new product.
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

            if (!Object.values(ProductCategory).includes(input.category)) {
                return res.status(400).json({
                    message: `Invalid category. Must be one of: ${Object.values(ProductCategory).join(", ")}`,
                });
            }

            const product = await this.productService.createProduct(merchantId, input);

            // Invalidate search cache
            await this.searchService.invalidateCache();

            return res.status(201).json(product);
        } catch (error) {
            log.error("Error creating product", { error: (error as Error).message });
            return res.status(500).json({ message: (error as Error).message || "Internal server error" });
        }
    };

    /**
     * PUT /products/:id — Update a product.
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
     * DELETE /products/:id — Soft-delete a product.
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
     * POST /products/:id/images — Upload a product image.
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
     * DELETE /products/:id/images — Remove a product image.
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
     * POST /products/:id/customizations — Add a customization group.
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
     * PUT /products/customizations/:customizationId — Update customization.
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
     * DELETE /products/customizations/:customizationId — Delete customization.
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
     * POST /products/customizations/:customizationId/options — Add an option.
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
     * PUT /products/options/:optionId — Update an option.
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
     * DELETE /products/options/:optionId — Delete an option.
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
     * PATCH /products/stock — Bulk update stock quantities.
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
