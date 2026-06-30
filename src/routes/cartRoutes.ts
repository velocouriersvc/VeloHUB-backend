import { Router } from "express";
import { CartController } from "../controllers/CartController";
import { apiKeyMiddleware } from "../middleware/api-key-middleware";
import { requireRole } from "../middleware/role-middleware";
import { validate, body } from "../middleware/validate";

const router = Router();
const cartController = new CartController();

// Apply API Key Middleware
router.use(apiKeyMiddleware);

const buyerRole = requireRole(["buyer"]);

// ════════════════════════════════════════════════════════════════════
//  CART ENDPOINTS
// ════════════════════════════════════════════════════════════════════

/**
 * @openapi
 * /cart:
 *   get:
 *     tags: [Cart]
 *     summary: Get cart
 *     description: |
 *       Returns the user's cart with items, product details, merchant info, and subtotal.
 *       Creates an empty cart if none exists. Reads from Redis cache when available.
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/PhoneNumber'
 *     responses:
 *       200:
 *         description: Cart with items
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 cart:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     merchantId:
 *                       type: string
 *                       nullable: true
 *                     merchant:
 *                       type: object
 *                       nullable: true
 *                       properties:
 *                         businessName:
 *                           type: string
 *                         category:
 *                           type: string
 *                     items:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                           productId:
 *                             type: string
 *                           productName:
 *                             type: string
 *                           productImage:
 *                             type: string
 *                             nullable: true
 *                           quantity:
 *                             type: integer
 *                           unitPrice:
 *                             type: number
 *                           selectedOptions:
 *                             type: array
 *                             nullable: true
 *                             items:
 *                               type: object
 *                               properties:
 *                                 customizationId:
 *                                   type: string
 *                                 optionId:
 *                                   type: string
 *                                 optionName:
 *                                   type: string
 *                                 price:
 *                                   type: number
 *                           itemTotal:
 *                             type: number
 *                     subtotal:
 *                       type: number
 *                     itemCount:
 *                       type: integer
 *       401:
 *         description: User ID required
 */
router.get("/", buyerRole, cartController.getCart);

/**
 * @openapi
 * /cart/add:
 *   post:
 *     tags: [Cart]
 *     summary: Add item to cart
 *     description: |
 *       Adds a product to the cart. Enforces **single-merchant rule** - all items must
 *       come from the same merchant. Returns 409 if the product belongs to a different merchant.
 *
 *       - Validates product exists and is active
 *       - Checks stock availability
 *       - Resolves selected customization options
 *       - Validates required customizations are selected
 *       - If the same product+options combo exists, increments quantity
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/PhoneNumber'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - productId
 *               - quantity
 *             properties:
 *               productId:
 *                 type: string
 *                 format: uuid
 *               quantity:
 *                 type: integer
 *                 minimum: 1
 *               selectedOptions:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required:
 *                     - customizationId
 *                     - optionId
 *                   properties:
 *                     customizationId:
 *                       type: string
 *                       format: uuid
 *                     optionId:
 *                       type: string
 *                       format: uuid
 *     responses:
 *       200:
 *         description: Item added
 *       400:
 *         description: Validation error (missing fields, insufficient stock, required customization)
 *       404:
 *         description: Product not found or inactive
 *       409:
 *         description: Different merchant conflict
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                 currentMerchant:
 *                   type: string
 *                 newMerchant:
 *                   type: string
 */
router.post("/add", buyerRole, validate([
    body("productId").required().isUUID(),
    body("quantity").required().isNumber().isPositive(),
]), cartController.addItem);

/**
 * @openapi
 * /cart/items/{itemId}:
 *   patch:
 *     tags: [Cart]
 *     summary: Update cart item quantity
 *     description: Update the quantity of a cart item. Minimum 1. Use DELETE to remove.
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/PhoneNumber'
 *       - in: path
 *         name: itemId
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
 *             required:
 *               - quantity
 *             properties:
 *               quantity:
 *                 type: integer
 *                 minimum: 1
 *     responses:
 *       200:
 *         description: Quantity updated
 *       400:
 *         description: Invalid quantity or insufficient stock
 *       404:
 *         description: Cart or item not found
 */
router.patch("/items/:itemId", buyerRole, validate([
    body("quantity").required().isNumber().min(1),
]), cartController.updateItemQuantity);

/**
 * @openapi
 * /cart/items/{itemId}:
 *   delete:
 *     tags: [Cart]
 *     summary: Remove item from cart
 *     description: Removes a single item from the cart. If last item, clears merchantId.
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/PhoneNumber'
 *       - in: path
 *         name: itemId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Item removed
 *       404:
 *         description: Cart or item not found
 */
router.delete("/items/:itemId", buyerRole, cartController.removeItem);

/**
 * @openapi
 * /cart:
 *   delete:
 *     tags: [Cart]
 *     summary: Clear entire cart
 *     description: Removes all items from the cart and resets the merchantId.
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/PhoneNumber'
 *     responses:
 *       200:
 *         description: Cart cleared
 */
router.delete("/", buyerRole, cartController.clearCart);

export default router;
