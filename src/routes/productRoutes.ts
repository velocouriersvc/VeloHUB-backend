import { Router } from "express";
import { ProductController } from "../controllers/ProductController";
import { apiKeyMiddleware } from "../middleware/api-key-middleware";
import { requireRole } from "../middleware/role-middleware";
import { upload } from "../middleware/upload-middleware";
import { validate, body } from "../middleware/validate";

const router = Router();
const productController = new ProductController();

// Apply API Key Middleware
router.use(apiKeyMiddleware);

const merchantRole = requireRole(["merchant"]);
const anyRole = requireRole(["buyer", "driver", "merchant", "admin"]);

// ════════════════════════════════════════════════════════════════════
//  PUBLIC ENDPOINTS
// ════════════════════════════════════════════════════════════════════

/**
 * @openapi
 * /products/categories:
 *   get:
 *     tags: [Products]
 *     summary: Get product categories
 *     description: Returns a list of available product categories. Public — any authenticated role.
 *     security:
 *       - ApiKeyAuth: []
 *     responses:
 *       200:
 *         description: List of categories
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 categories:
 *                   type: array
 *                   items:
 *                     type: string
 *       403:
 *         description: Invalid API key or role not approved
 */
router.get("/categories", productController.getCategories);

/**
 * @openapi
 * /products/categories:
 *   post:
 *     tags: [Products]
 *     summary: Suggest a new product/service category
 *     description: Merchant submits a new category for admin review. Created as inactive until approved.
 *     security:
 *       - ApiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name:
 *                 type: string
 *               type:
 *                 type: string
 *                 enum: [marketplace, service]
 *     responses:
 *       201:
 *         description: Category submitted for review
 *       400:
 *         description: Validation error or duplicate
 */
router.post("/categories", merchantRole, productController.suggestCategory);

/**
 * @openapi
 * /products:
 *   get:
 *     tags: [Products]
 *     summary: List products
 *     description: Returns a paginated, filterable list of active products. Public — any authenticated role.
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/PhoneNumber'
 *       - name: merchantId
 *         in: query
 *         description: Filter by merchant ID
 *         schema:
 *           type: string
 *           format: uuid
 *       - name: category
 *         in: query
 *         description: Filter by product category
 *         schema:
 *           type: string
 *           enum: [food, grocery, pharmacy, marketplace, services]
 *       - name: search
 *         in: query
 *         description: Text search in name, description, and tags
 *         schema:
 *           type: string
 *       - name: page
 *         in: query
 *         schema:
 *           type: integer
 *           default: 1
 *       - name: limit
 *         in: query
 *         schema:
 *           type: integer
 *           default: 20
 *           maximum: 50
 *     responses:
 *       200:
 *         description: Paginated product list with merchant and customization info
 *       403:
 *         description: Invalid API key or role not approved
 */
router.get("/", productController.getProducts);

/**
 * @openapi
 * /products/popular:
 *   get:
 *     tags: [Products]
 *     summary: Get popular products for a category
 *     description: Returns the highest-ordered products for a specified category. Public — any authenticated role.
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - name: category
 *         in: query
 *         description: Product category to filter by
 *         schema:
 *           type: string
 *           default: food
 *       - name: limit
 *         in: query
 *         description: Maximum number of popular products to return
 *         schema:
 *           type: integer
 *           default: 5
 *     responses:
 *       200:
 *         description: Popular product list
 *       403:
 *         description: Invalid API key or role not approved
 */
router.get("/popular", productController.getPopularProducts);

// ════════════════════════════════════════════════════════════════════
//  MERCHANT ENDPOINTS (static paths BEFORE :id param routes)
// ════════════════════════════════════════════════════════════════════

/**
 * @openapi
 * /products/my:
 *   get:
 *     tags: [Products]
 *     summary: Get my products (merchant)
 *     description: Returns the merchant's own products, including inactive ones. Requires **merchant** role.
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/PhoneNumber'
 *       - name: page
 *         in: query
 *         schema:
 *           type: integer
 *           default: 1
 *       - name: limit
 *         in: query
 *         schema:
 *           type: integer
 *           default: 20
 *     responses:
 *       200:
 *         description: Paginated list of merchant's products
 *       403:
 *         description: Invalid API key or merchant role not approved
 */
router.get("/my", merchantRole, productController.getMyProducts);

/**
 * @openapi
 * /products/stock:
 *   patch:
 *     tags: [Products]
 *     summary: Bulk update stock quantities
 *     description: Update stock for multiple products at once. Requires **merchant** role.
 *     security:
 *       - ApiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [items]
 *             properties:
 *               items:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required: [productId, stockQuantity]
 *                   properties:
 *                     productId:
 *                       type: string
 *                       format: uuid
 *                     stockQuantity:
 *                       type: integer
 *                       example: 50
 *     responses:
 *       200:
 *         description: Stock updated
 *       400:
 *         description: Invalid items array
 *       403:
 *         description: Invalid API key or merchant role not approved
 */
router.patch("/stock", merchantRole, validate([
    body("items").required().isArray(),
]), productController.updateStock);

// ── Customization sub-routes (static paths) ─────────────────────────

/**
 * @openapi
 * /products/customizations/{customizationId}:
 *   put:
 *     tags: [Products]
 *     summary: Update a customization group
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/PhoneNumber'
 *       - name: customizationId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title:
 *                 type: string
 *               isRequired:
 *                 type: boolean
 *               minSelections:
 *                 type: integer
 *               maxSelections:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Updated customization
 *       404:
 *         description: Customization not found
 *       403:
 *         description: Invalid API key or merchant role not approved
 */
router.put("/customizations/:customizationId", merchantRole, productController.updateCustomization);

/**
 * @openapi
 * /products/customizations/{customizationId}:
 *   delete:
 *     tags: [Products]
 *     summary: Delete a customization group (cascades to options)
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/PhoneNumber'
 *       - name: customizationId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Customization deleted
 *       404:
 *         description: Customization not found
 *       403:
 *         description: Invalid API key or merchant role not approved
 */
router.delete("/customizations/:customizationId", merchantRole, productController.deleteCustomization);

/**
 * @openapi
 * /products/customizations/{customizationId}/options:
 *   post:
 *     tags: [Products]
 *     summary: Add an option to a customization group
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/PhoneNumber'
 *       - name: customizationId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name:
 *                 type: string
 *                 example: "Extra Cheese"
 *               price:
 *                 type: number
 *                 example: 3.00
 *               isDefault:
 *                 type: boolean
 *     responses:
 *       201:
 *         description: Option created
 *       404:
 *         description: Customization not found
 *       403:
 *         description: Invalid API key or merchant role not approved
 */
router.post("/customizations/:customizationId/options", merchantRole, productController.addOption);

/**
 * @openapi
 * /products/options/{optionId}:
 *   put:
 *     tags: [Products]
 *     summary: Update a customization option
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/PhoneNumber'
 *       - name: optionId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               price:
 *                 type: number
 *               isDefault:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Updated option
 *       404:
 *         description: Option not found
 */
router.put("/options/:optionId", merchantRole, productController.updateOption);

/**
 * @openapi
 * /products/options/{optionId}:
 *   delete:
 *     tags: [Products]
 *     summary: Delete a customization option
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/PhoneNumber'
 *       - name: optionId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Option deleted
 *       404:
 *         description: Option not found
 */
router.delete("/options/:optionId", merchantRole, productController.deleteOption);

// ════════════════════════════════════════════════════════════════════
//  PARAMETERISED ROUTES (after static routes)
// ════════════════════════════════════════════════════════════════════

/**
 * @openapi
 * /products/{id}:
 *   get:
 *     tags: [Products]
 *     summary: Get product details
 *     description: Returns a single product with customizations, options, and merchant info.
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/PhoneNumber'
 *       - name: id
 *         in: path
 *         required: true
 *         description: Product ID (UUID)
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Product object
 *       404:
 *         description: Product not found
 *       403:
 *         description: Invalid API key or role not approved
 */
router.get("/:id", productController.getProduct);

/**
 * @openapi
 * /products:
 *   post:
 *     tags: [Products]
 *     summary: Create a new product
 *     description: Create a product with optional customizations and options. Requires **merchant** role.
 *     security:
 *       - ApiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, category, price]
 *             properties:
 *               name:
 *                 type: string
 *                 example: "Jollof Rice"
 *               description:
 *                 type: string
 *               category:
 *                 type: string
 *                 enum: [food, grocery, pharmacy, marketplace, services]
 *               price:
 *                 type: number
 *                 example: 25.00
 *               stock_level:
 *                 type: integer
 *               min_stock_alert:
 *                 type: integer
 *               images:
 *                 type: array
 *                 items:
 *                   type: string
 *               options:
 *                 type: array
 *                 description: Specialized Add-ons & Options for food category (alias for customizations)
 *                 items:
 *                   type: object
 *                   properties:
 *                     name:
 *                       type: string
 *                     items:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           name:
 *                             type: string
 *                           price:
 *                             type: number
 *               customizations:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     title:
 *                       type: string
 *                     options:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           name:
 *                             type: string
 *                           price:
 *                             type: number
 *     responses:
 *       201:
 *         description: Product created
 *       400:
 *         description: Validation error
 *       403:
 *         description: Invalid API key or merchant role not approved
 */
router.post("/", merchantRole, validate([
    body("name").required().isString().minLength(2),
    body("category").required().isString(),
    body("price").required().isNumber().isPositive(),
]), productController.createProduct);

/**
 * @openapi
 * /products/{id}:
 *   put:
 *     tags: [Products]
 *     summary: Update a product
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Updated product
 *       404:
 *         description: Product not found
 */
router.put("/:id", merchantRole, productController.updateProduct);

/**
 * @openapi
 * /products/{id}:
 *   delete:
 *     tags: [Products]
 *     summary: Delete a product (soft delete)
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Product deleted
 *       404:
 *         description: Product not found
 */
router.delete("/:id", merchantRole, productController.deleteProduct);

// ── Image endpoints (on :id) ───────────────────────────────────────

/**
 * @openapi
 * /products/{id}/images:
 *   post:
 *     tags: [Products]
 *     summary: Upload a product image
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Image uploaded
 *       400:
 *         description: No file provided
 *       404:
 *         description: Product not found
 */
router.post("/:id/images", merchantRole, upload.single("file"), productController.uploadImage);

/**
 * @openapi
 * /products/{id}/images:
 *   delete:
 *     tags: [Products]
 *     summary: Remove a product image
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [imageUrl]
 *             properties:
 *               imageUrl:
 *                 type: string
 *     responses:
 *       200:
 *         description: Image removed
 *       404:
 *         description: Product not found
 */
router.delete("/:id/images", merchantRole, productController.removeImage);

/**
 * @openapi
 * /products/{id}/customizations:
 *   post:
 *     tags: [Products]
 *     summary: Add a customization group to a product
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [title, options]
 *             properties:
 *               title:
 *                 type: string
 *               options:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required: [name]
 *                   properties:
 *                     name:
 *                       type: string
 *                     price:
 *                       type: number
 *     responses:
 *       201:
 *         description: Product with new customization
 *       404:
 *         description: Product not found
 */
router.post("/:id/customizations", merchantRole, productController.addCustomization);

export default router;
