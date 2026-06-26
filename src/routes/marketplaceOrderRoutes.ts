import { Router } from "express";
import { MarketplaceOrderController } from "../controllers/MarketplaceOrderController";
import { apiKeyMiddleware } from "../middleware/api-key-middleware";
import { requireRole } from "../middleware/role-middleware";
import { validate, body } from "../middleware/validate";
import { DeliveryType, OrderPaymentMethod } from "../models/order";

const router = Router();
const orderController = new MarketplaceOrderController();

// Apply API Key Middleware
router.use(apiKeyMiddleware);

const buyerRole = requireRole(["buyer"]);

// ════════════════════════════════════════════════════════════════════
//  QUOTE
// ════════════════════════════════════════════════════════════════════

/**
 * @openapi
 * /marketplace/orders/quote:
 *   post:
 *     tags: [Orders]
 *     summary: Get order quote
 *     description: |
 *       Returns a price breakdown for the user's current cart **without** placing an order.
 *       Use this to show the checkout summary screen.
 *
 *       - Calculates service fee, commission, delivery fee, promo discount
 *       - Validates minimum order value (MOV)
 *       - Returns estimated delivery time for delivery orders
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
 *               - deliveryType
 *             properties:
 *               deliveryType:
 *                 type: string
 *                 enum: [delivery, pickup]
 *               deliveryLat:
 *                 type: number
 *                 description: Required for delivery
 *               deliveryLng:
 *                 type: number
 *                 description: Required for delivery
 *               deliveryAddress:
 *                 type: string
 *               promoCode:
 *                 type: string
 *     responses:
 *       200:
 *         description: Price breakdown
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 quote:
 *                   type: object
 *                   properties:
 *                     subtotal:
 *                       type: number
 *                     serviceFee:
 *                       type: number
 *                     commission:
 *                       type: number
 *                     deliveryFee:
 *                       type: number
 *                     discount:
 *                       type: number
 *                     totalAmount:
 *                       type: number
 *                     merchantEarnings:
 *                       type: number
 *                     currency:
 *                       type: string
 *                     estimatedDeliveryMin:
 *                       type: integer
 *                       nullable: true
 *                     promoApplied:
 *                       type: boolean
 *       400:
 *         description: Cart empty, below MOV, or missing delivery coordinates
 */
router.post("/quote", buyerRole, validate([
    body("deliveryType").required().isIn(Object.values(DeliveryType)),
    body("deliveryLat").optional().isNumber(),
    body("deliveryLng").optional().isNumber(),
]), orderController.getQuote);

// ════════════════════════════════════════════════════════════════════
//  CHECKOUT
// ════════════════════════════════════════════════════════════════════

/**
 * @openapi
 * /marketplace/orders/checkout:
 *   post:
 *     tags: [Orders]
 *     summary: Place an order (checkout)
 *     description: |
 *       Creates an order from the user's cart.
 *
 *       **Flow:**
 *       1. Validates cart, stock, MOV
 *       2. Calculates fees + promo discount
 *       3. Decrements product stock
 *       4. Creates order record
 *       5. Processes payment (momo/card/wallet/cash)
 *       6. Clears the user's cart
 *       7. Notifies merchant of new order
 *       8. For pickup orders: generates 6-char pickup code + notifies customer
 *
 *       If payment fails, stock is restored and the order is rolled back.
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
 *               - deliveryType
 *               - paymentMethod
 *             properties:
 *               deliveryType:
 *                 type: string
 *                 enum: [delivery, pickup]
 *               deliveryAddress:
 *                 type: string
 *                 description: Required for delivery
 *               deliveryLat:
 *                 type: number
 *                 description: Required for delivery
 *               deliveryLng:
 *                 type: number
 *                 description: Required for delivery
 *               paymentMethod:
 *                 type: string
 *                 enum: [momo, card, cash, wallet]
 *               promoCode:
 *                 type: string
 *               customerNote:
 *                 type: string
 *               phoneNumber:
 *                 type: string
 *                 description: Required for momo payments
 *     responses:
 *       201:
 *         description: Order placed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 order:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     orderNumber:
 *                       type: string
 *                     status:
 *                       type: string
 *                     totalAmount:
 *                       type: number
 *                     paymentStatus:
 *                       type: string
 *                     pickupCode:
 *                       type: string
 *                       nullable: true
 *                     deliveryType:
 *                       type: string
 *                 payment:
 *                   type: object
 *                   nullable: true
 *                   properties:
 *                     reference:
 *                       type: string
 *                     authorizationUrl:
 *                       type: string
 *                     status:
 *                       type: string
 *       400:
 *         description: Cart empty, below MOV, missing required fields
 *       402:
 *         description: Payment failed
 *       409:
 *         description: Out of stock
 */
router.post("/checkout", buyerRole, validate([
    body("deliveryType").required().isIn(Object.values(DeliveryType)),
    body("paymentMethod").required().isIn(Object.values(OrderPaymentMethod)),
    body("deliveryLat").optional().isNumber(),
    body("deliveryLng").optional().isNumber(),
]), orderController.checkout);

// ════════════════════════════════════════════════════════════════════
//  MY ORDERS - static routes before :id
// ════════════════════════════════════════════════════════════════════

/**
 * @openapi
 * /marketplace/orders:
 *   get:
 *     tags: [Orders]
 *     summary: Get my orders
 *     description: |
 *       Returns the customer's order history with pagination.
 *       Optionally filter by status.
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/PhoneNumber'
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, accepted, preparing, ready_for_pickup, driver_assigned, picked_up, in_transit, delivered, completed, cancelled, refunded]
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *           maximum: 50
 *     responses:
 *       200:
 *         description: Paginated order list
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 orders:
 *                   type: array
 *                   items:
 *                     type: object
 *                 total:
 *                   type: integer
 *                 page:
 *                   type: integer
 *                 limit:
 *                   type: integer
 */
router.get("/", buyerRole, orderController.getMyOrders);

// ════════════════════════════════════════════════════════════════════
//  ACTIVE ORDER
// ════════════════════════════════════════════════════════════════════

/**
 * @openapi
 * /marketplace/orders/active:
 *   get:
 *     tags: [Orders]
 *     summary: Get customer's active/ongoing order
 *     description: |
 *       Returns the most recent order that is not completed or cancelled.
 *       Useful for "Track your order" feature.
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/PhoneNumber'
 *     responses:
 *       200:
 *         description: Active order or null
 */
router.get("/active", buyerRole, orderController.getActiveOrder);

// ════════════════════════════════════════════════════════════════════
//  ORDER DETAIL & ACTIONS - parameterized routes last
// ════════════════════════════════════════════════════════════════════

/**
 * @openapi
 * /marketplace/orders/{id}:
 *   get:
 *     tags: [Orders]
 *     summary: Get order details
 *     description: |
 *       Returns full order details including items, status history, merchant info, and driver info.
 *       Accessible by the customer, merchant, or assigned driver.
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/PhoneNumber'
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Full order object
 *       403:
 *         description: You do not have access to this order
 *       404:
 *         description: Order not found
 */
router.get("/:id", buyerRole, orderController.getOrder);

/**
 * @openapi
 * /marketplace/orders/{id}/cancel:
 *   post:
 *     tags: [Orders]
 *     summary: Cancel order (customer)
 *     description: |
 *       Customer cancels their own order. Only allowed when order is in **pending** or **accepted** status.
 *       - Restores product stock
 *       - Notifies merchant
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/PhoneNumber'
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               reason:
 *                 type: string
 *     responses:
 *       200:
 *         description: Order cancelled
 *       400:
 *         description: Cannot cancel order in current status
 *       404:
 *         description: Order not found
 */
router.post("/:id/cancel", buyerRole, orderController.cancelOrder);

export default router;
