import { Router } from "express";
import { AdminController } from "../controllers/AdminController";
import { apiKeyMiddleware } from "../middleware/api-key-middleware";
import { requireRole } from "../middleware/role-middleware";
import { validate, body } from "../middleware/validate";
import { OrderStatus } from "../models/order";

const router = Router();
const adminController = new AdminController();

// All admin routes require API Key and Admin Role
router.use(apiKeyMiddleware);
const adminRole = requireRole(["admin"]);

// ────────────────────────────────────────────────────────────────
//  Existing (legacy) endpoints
// ────────────────────────────────────────────────────────────────

/**
 * @openapi
 * /admin/drivers:
 *   get:
 *     tags: [Admin]
 *     summary: List all drivers
 *     security:
 *       - ApiKeyAuth: []
 *     responses:
 *       200:
 *         description: List of drivers
 *   post:
 *     tags: [Admin]
 *     summary: Create new driver
 *     security:
 *       - ApiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               full_name: { type: string }
 *               email: { type: string }
 *               phone: { type: string }
 *               vehicle_type: { type: string }
 *               vehicle_number: { type: string }
 *               license_number: { type: string }
 *     responses:
 *       201:
 *         description: Driver created
 */
router.get("/drivers", adminRole, adminController.getDrivers);
router.post("/drivers", adminRole, adminController.createDriver);

/**
 * @openapi
 * /admin/merchants:
 *   get:
 *     tags: [Admin]
 *     summary: List all merchants
 *     security:
 *       - ApiKeyAuth: []
 *     responses:
 *       200:
 *         description: List of merchants
 */
router.get("/merchants", adminRole, adminController.getMerchants);

/**
 * @openapi
 * /admin/rides:
 *   get:
 *     tags: [Admin]
 *     summary: List all rides
 *     security:
 *       - ApiKeyAuth: []
 *     responses:
 *       200:
 *         description: List of rides
 */
router.get("/rides", adminRole, adminController.getRides);

/**
 * @openapi
 * /admin/users:
 *   get:
 *     tags: [Admin]
 *     summary: List all users
 *     security:
 *       - ApiKeyAuth: []
 *     responses:
 *       200:
 *         description: List of users
 */
router.get("/users", adminRole, adminController.getUsers);

/**
 * @openapi
 * /admin/drivers/{id}:
 *   patch:
 *     tags: [Admin]
 *     summary: Update driver details or status
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               full_name: { type: string }
 *               email: { type: string }
 *               phone: { type: string }
 *               vehicle_type: { type: string }
 *               vehicle_number: { type: string }
 *               status:
 *                 type: string
 *     responses:
 *       200:
 *         description: Driver updated
 */
router.patch("/drivers/:id", adminRole, adminController.updateDriver);

/**
 * @openapi
 * /admin/merchants/{id}:
 *   patch:
 *     tags: [Admin]
 *     summary: Update merchant verification status (legacy)
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [pending, approved, rejected]
 *     responses:
 *       200:
 *         description: Merchant status updated
 */
router.patch("/merchants/:id", adminRole, adminController.updateMerchantStatus);

// ────────────────────────────────────────────────────────────────
//  Dashboard
// ────────────────────────────────────────────────────────────────

/**
 * @openapi
 * /admin/dashboard:
 *   get:
 *     tags: [Admin - Dashboard]
 *     summary: Get admin dashboard overview
 *     description: Returns user/merchant/driver counts, today's stats, and pending action counts.
 *     security:
 *       - ApiKeyAuth: []
 *     responses:
 *       200:
 *         description: Dashboard data
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 totalUsers:
 *                   type: number
 *                 totalMerchants:
 *                   type: number
 *                 totalDrivers:
 *                   type: number
 *                 activeMerchants:
 *                   type: number
 *                 activeDrivers:
 *                   type: number
 *                 todaysOrders:
 *                   type: number
 *                 todaysRides:
 *                   type: number
 *                 todaysRevenue:
 *                   type: number
 *                 todaysPlatformFees:
 *                   type: number
 *                 pendingActions:
 *                   type: object
 */
router.get("/dashboard", adminRole, adminController.getDashboard);

// ────────────────────────────────────────────────────────────────
//  Orders
// ────────────────────────────────────────────────────────────────

/**
 * @openapi
 * /admin/orders:
 *   get:
 *     tags: [Admin - Orders]
 *     summary: List orders with filters & pagination
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [PENDING, CONFIRMED, PREPARING, READY_FOR_PICKUP, READY_FOR_DELIVERY, DRIVER_ASSIGNED, PICKED_UP, IN_TRANSIT, DELIVERED, COMPLETED, CANCELLED, REFUNDED]
 *       - in: query
 *         name: merchantId
 *         schema:
 *           type: string
 *       - in: query
 *         name: customerId
 *         schema:
 *           type: string
 *       - in: query
 *         name: paymentStatus
 *         schema:
 *           type: string
 *           enum: [PENDING, PAID, ESCROWED, SETTLED, REFUNDED]
 *       - in: query
 *         name: deliveryType
 *         schema:
 *           type: string
 *           enum: [PICKUP, DELIVERY]
 *       - in: query
 *         name: from
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: to
 *         schema:
 *           type: string
 *           format: date
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
 *     responses:
 *       200:
 *         description: Paginated list of orders
 */
router.get("/orders", adminRole, adminController.getOrders);

/**
 * @openapi
 * /admin/orders/{id}:
 *   get:
 *     tags: [Admin - Orders]
 *     summary: Get order detail
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Order detail with relations
 *       404:
 *         description: Order not found
 */
router.get("/orders/:id", adminRole, adminController.getOrderDetail);

/**
 * @openapi
 * /admin/orders/{id}/status:
 *   patch:
 *     tags: [Admin - Orders]
 *     summary: Override order status
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [status]
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [PENDING, CONFIRMED, PREPARING, READY_FOR_PICKUP, READY_FOR_DELIVERY, DRIVER_ASSIGNED, PICKED_UP, IN_TRANSIT, DELIVERED, COMPLETED, CANCELLED, REFUNDED]
 *               note:
 *                 type: string
 *     responses:
 *       200:
 *         description: Order status updated
 *       404:
 *         description: Order not found
 */
router.patch("/orders/:id/status", adminRole, validate([
    body("status").required().isIn(Object.values(OrderStatus)),
    body("reason").optional().isString(),
]), adminController.overrideOrderStatus);

/**
 * @openapi
 * /admin/orders/{id}/refund:
 *   post:
 *     tags: [Admin - Orders]
 *     summary: Refund an order (credits customer wallet)
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
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
 *         description: Order refunded
 *       400:
 *         description: Already refunded
 *       404:
 *         description: Order not found
 */
router.post("/orders/:id/refund", adminRole, adminController.refundOrder);

/**
 * @openapi
 * /admin/orders/{id}/cancel:
 *   post:
 *     tags: [Admin - Orders]
 *     summary: Admin cancel an order
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
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
 *         description: Cannot cancel order in current state
 *       404:
 *         description: Order not found
 */
router.post("/orders/:id/cancel", adminRole, adminController.adminCancelOrder);

/**
 * @openapi
 * /admin/orders/{id}/assign-driver:
 *   post:
 *     tags: [Admin - Support]
 *     summary: Assign a driver to an order
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [driverId]
 *             properties:
 *               driverId:
 *                 type: string
 *     responses:
 *       200:
 *         description: Driver assigned
 *       400:
 *         description: Invalid order state
 *       404:
 *         description: Order or driver not found
 */
router.post("/orders/:id/assign-driver", adminRole, validate([
    body("driverId").required().isUUID(),
]), adminController.assignDriver);

/**
 * @openapi
 * /admin/orders/{id}/reassign-driver:
 *   post:
 *     tags: [Admin - Support]
 *     summary: Reassign a different driver to an order
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [driverId]
 *             properties:
 *               driverId:
 *                 type: string
 *     responses:
 *       200:
 *         description: Driver reassigned
 *       400:
 *         description: Invalid order state
 *       404:
 *         description: Order or driver not found
 */
router.post("/orders/:id/reassign-driver", adminRole, validate([
    body("driverId").required().isUUID(),
    body("reason").optional().isString(),
]), adminController.reassignDriver);

// ────────────────────────────────────────────────────────────────
//  Products
// ────────────────────────────────────────────────────────────────

/**
 * @openapi
 * /admin/products:
 *   get:
 *     tags: [Admin - Products]
 *     summary: List products with filters (including soft-deleted)
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: query
 *         name: merchantId
 *         schema:
 *           type: string
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *       - in: query
 *         name: isActive
 *         schema:
 *           type: boolean
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
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
 *     responses:
 *       200:
 *         description: Paginated list of products
 */
router.get("/products", adminRole, adminController.getProducts);

/**
 * @openapi
 * /admin/products/{id}:
 *   patch:
 *     tags: [Admin - Products]
 *     summary: Suspend or reactivate a product
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [action]
 *             properties:
 *               action:
 *                 type: string
 *                 enum: [suspend, reactivate]
 *     responses:
 *       200:
 *         description: Product updated
 *       404:
 *         description: Product not found
 */
router.patch("/products/:id", adminRole, adminController.updateProduct);

/**
 * @openapi
 * /admin/products/{id}:
 *   delete:
 *     tags: [Admin - Products]
 *     summary: Soft-delete a product
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Product deleted
 *       404:
 *         description: Product not found
 */
router.delete("/products/:id", adminRole, adminController.deleteProduct);

// ────────────────────────────────────────────────────────────────
//  Merchants (extended)
// ────────────────────────────────────────────────────────────────

/**
 * @openapi
 * /admin/merchants/{id}/details:
 *   get:
 *     tags: [Admin - Merchants]
 *     summary: Get merchant profile, stats, wallet & recent orders
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Merchant details
 *       404:
 *         description: Merchant not found
 */
router.get("/merchants/:id/details", adminRole, adminController.getMerchantDetails);

/**
 * @openapi
 * /admin/merchants/{id}/rates:
 *   patch:
 *     tags: [Admin - Merchants]
 *     summary: Update merchant commission/service/pickup fee rates
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               commissionRate:
 *                 type: number
 *                 minimum: 0
 *                 maximum: 100
 *               serviceFeeRate:
 *                 type: number
 *                 minimum: 0
 *                 maximum: 100
 *               pickupFeeRate:
 *                 type: number
 *                 minimum: 0
 *                 maximum: 100
 *     responses:
 *       200:
 *         description: Rates updated
 *       400:
 *         description: Rates must be 0-100
 *       404:
 *         description: Merchant not found
 */
router.patch("/merchants/:id/rates", adminRole, adminController.updateMerchantRates);

/**
 * @openapi
 * /admin/merchants/{id}/suspend:
 *   post:
 *     tags: [Admin - Merchants]
 *     summary: Suspend a merchant
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
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
 *         description: Merchant suspended
 *       404:
 *         description: Merchant not found
 */
router.post("/merchants/:id/suspend", adminRole, adminController.suspendMerchant);

/**
 * @openapi
 * /admin/merchants/{id}/approve:
 *   post:
 *     tags: [Admin - Merchants]
 *     summary: Approve a merchant (creates wallet, approves role)
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Merchant approved
 *       404:
 *         description: Merchant not found
 */
router.post("/merchants/:id/approve", adminRole, adminController.approveMerchant);

/**
 * @openapi
 * /admin/merchants/{id}/orders:
 *   get:
 *     tags: [Admin - Merchants]
 *     summary: Get orders for a specific merchant
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
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
 *     responses:
 *       200:
 *         description: Paginated merchant orders
 */
router.get("/merchants/:id/orders", adminRole, adminController.getMerchantOrders);

/**
 * @openapi
 * /admin/merchants/{id}/finances:
 *   get:
 *     tags: [Admin - Merchants]
 *     summary: Get merchant financial overview (wallet, rates, stats, payouts)
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Merchant financial data
 */
router.get("/merchants/:id/finances", adminRole, adminController.getMerchantFinances);

// ────────────────────────────────────────────────────────────────
//  Payouts
// ────────────────────────────────────────────────────────────────

/**
 * @openapi
 * /admin/payouts:
 *   get:
 *     tags: [Admin - Payouts]
 *     summary: List payout requests with filters
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, completed, rejected]
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
 *     responses:
 *       200:
 *         description: Paginated payouts
 */
router.get("/payouts", adminRole, adminController.getPayouts);

/**
 * @openapi
 * /admin/payouts/{id}/approve:
 *   patch:
 *     tags: [Admin - Payouts]
 *     summary: Approve a payout request
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Payout approved
 *       400:
 *         description: Already processed
 *       404:
 *         description: Payout not found
 */
router.patch("/payouts/:id/approve", adminRole, adminController.approvePayout);

/**
 * @openapi
 * /admin/payouts/{id}/reject:
 *   patch:
 *     tags: [Admin - Payouts]
 *     summary: Reject a payout request (refunds amount to wallet)
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
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
 *         description: Payout rejected & refunded
 *       400:
 *         description: Already processed
 *       404:
 *         description: Payout not found
 */
router.patch("/payouts/:id/reject", adminRole, validate([
    body("reason").required().isString().minLength(5),
]), adminController.rejectPayout);

// ────────────────────────────────────────────────────────────────
//  Platform Settings
// ────────────────────────────────────────────────────────────────

/**
 * @openapi
 * /admin/settings:
 *   get:
 *     tags: [Admin - Settings]
 *     summary: Get all platform settings (all countries)
 *     security:
 *       - ApiKeyAuth: []
 *     responses:
 *       200:
 *         description: Platform settings array
 */
router.get("/settings", adminRole, adminController.getSettings);

/**
 * @openapi
 * /admin/settings/{country}:
 *   put:
 *     tags: [Admin - Settings]
 *     summary: Upsert platform settings for a country
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: country
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               defaultCommissionRate:
 *                 type: number
 *               defaultServiceFeeRate:
 *                 type: number
 *               defaultDeliveryFeeBase:
 *                 type: number
 *               defaultDeliveryFeePerKm:
 *                 type: number
 *               currency:
 *                 type: string
 *               minOrderAmount:
 *                 type: number
 *               maxDeliveryRadiusKm:
 *                 type: number
 *     responses:
 *       200:
 *         description: Settings updated/created
 */
router.put("/settings/:country", adminRole, adminController.updateSettings);

// ────────────────────────────────────────────────────────────────
//  Reports
// ────────────────────────────────────────────────────────────────

/**
 * @openapi
 * /admin/reports/revenue:
 *   get:
 *     tags: [Admin - Reports]
 *     summary: Revenue report for a date range
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: query
 *         name: from
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: to
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *     responses:
 *       200:
 *         description: Revenue breakdown
 *       400:
 *         description: from and to are required
 */
router.get("/reports/revenue", adminRole, adminController.getRevenueReport);

// ────────────────────────────────────────────────────────────────
//  Wallets
// ────────────────────────────────────────────────────────────────

/**
 * @openapi
 * /admin/wallets:
 *   get:
 *     tags: [Admin - Wallets]
 *     summary: List all user wallets
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 100 }
 *     responses:
 *       200:
 *         description: List of wallets
 */
router.get("/wallets", adminRole, adminController.getWallets);

/**
 * @openapi
 * /admin/wallets/{id}/transactions:
 *   get:
 *     tags: [Admin - Wallets]
 *     summary: Get transaction history for a specific user's wallet
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 50 }
 *     responses:
 *       200:
 *         description: Transaction history
 */
router.get("/wallets/:id/transactions", adminRole, adminController.getWalletTransactions);

/**
 * @openapi
 * /admin/transactions:
 *   get:
 *     tags: [Admin - Wallets]
 *     summary: List all transactions across the platform
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 50 }
 *     responses:
 *       200:
 *         description: List of transactions
 */
router.get("/transactions", adminRole, adminController.getAllTransactions);

/**
 * @openapi
 * /admin/reports/orders:
 *   get:
 *     tags: [Admin - Reports]
 *     summary: Order distribution report for a date range
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: query
 *         name: from
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: to
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *     responses:
 *       200:
 *         description: Order distribution by status, payment method, delivery type
 *       400:
 *         description: from and to are required
 */
router.get("/reports/orders", adminRole, adminController.getOrderReport);

// ────────────────────────────────────────────────────────────────
//  Support – Wallet Actions
// ────────────────────────────────────────────────────────────────

/**
 * @openapi
 * /admin/users/{id}/credit-wallet:
 *   post:
 *     tags: [Admin - Support]
 *     summary: Credit a user's wallet (admin adjustment)
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [amount, reason]
 *             properties:
 *               amount:
 *                 type: number
 *                 minimum: 0.01
 *               reason:
 *                 type: string
 *     responses:
 *       200:
 *         description: Wallet credited
 *       404:
 *         description: User not found
 */
router.post("/users/:id/credit-wallet", adminRole, validate([
    body("amount").required().isNumber().isPositive(),
    body("description").required().isString().minLength(3),
]), adminController.creditWallet);

/**
 * @openapi
 * /admin/users/{id}/debit-wallet:
 *   post:
 *     tags: [Admin - Support]
 *     summary: Debit a user's wallet (admin adjustment)
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [amount, reason]
 *             properties:
 *               amount:
 *                 type: number
 *                 minimum: 0.01
 *               reason:
 *                 type: string
 *     responses:
 *       200:
 *         description: Wallet debited
 *       400:
 *         description: Insufficient balance
 *       404:
 *         description: User not found
 */
router.post("/users/:id/debit-wallet", adminRole, validate([
    body("amount").required().isNumber().isPositive(),
    body("description").required().isString().minLength(3),
]), adminController.debitWallet);

// ────────────────────────────────────────────────────────────────
//  Zones
// ────────────────────────────────────────────────────────────────

/**
 * @openapi
 * /admin/zones:
 *   get:
 *     tags: [Admin - Zones]
 *     summary: List all zones
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: header
 *         name: x-country-scope
 *         schema: { type: string }
 *       - in: header
 *         name: x-city-scope
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: List of zones
 */
router.get("/zones", adminRole, adminController.getZones);

/**
 * @openapi
 * /admin/zones:
 *   post:
 *     tags: [Admin - Zones]
 *     summary: Create a zone
 *     security:
 *       - ApiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, city]
 *             properties:
 *               name: { type: string }
 *               city: { type: string }
 *               country: { type: string }
 *               base_delivery_fee: { type: number }
 *               base_ride_fare: { type: number }
 *               per_km_rate: { type: number }
 *               radius_km: { type: number }
 *     responses:
 *       201:
 *         description: Zone created
 */
router.post("/zones", adminRole, adminController.createZone);

/**
 * @openapi
 * /admin/zones/{id}:
 *   put:
 *     tags: [Admin - Zones]
 *     summary: Update a zone
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Zone updated
 */
router.put("/zones/:id", adminRole, adminController.updateZone);

/**
 * @openapi
 * /admin/zones/{id}:
 *   delete:
 *     tags: [Admin - Zones]
 *     summary: Delete a zone
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       204:
 *         description: Zone deleted
 */
router.delete("/zones/:id", adminRole, adminController.deleteZone);

// ────────────────────────────────────────────────────────────────
//  Platform Withdrawals
// ────────────────────────────────────────────────────────────────

/**
 * @openapi
 * /admin/withdrawals:
 *   get:
 *     tags: [Admin - Withdrawals]
 *     summary: List platform withdrawals
 *     security:
 *       - ApiKeyAuth: []
 *     responses:
 *       200:
 *         description: List of withdrawals
 */
router.get("/withdrawals", adminRole, adminController.getWithdrawals);

/**
 * @openapi
 * /admin/withdrawals:
 *   post:
 *     tags: [Admin - Withdrawals]
 *     summary: Create a withdrawal
 *     security:
 *       - ApiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [amount, withdrawal_method, account_details]
 *             properties:
 *               amount: { type: number }
 *               withdrawal_method: { type: string }
 *               account_details: { type: string }
 *               notes: { type: string }
 *               country: { type: string }
 *               city: { type: string }
 *     responses:
 *       201:
 *         description: Withdrawal created
 */
router.post("/withdrawals", adminRole, adminController.createWithdrawal);

/**
 * @openapi
 * /admin/withdrawals/{id}:
 *   put:
 *     tags: [Admin - Withdrawals]
 *     summary: Update a withdrawal
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Withdrawal updated
 */
router.put("/withdrawals/:id", adminRole, adminController.updateWithdrawal);

// ────────────────────────────────────────────────────────────────
//  Simulation (Internal/Admin only)
// ────────────────────────────────────────────────────────────────

router.post("/simulate/ride", adminRole, adminController.simulateController.createSimulationRide);
router.patch("/simulate/ride/:id/advance", adminRole, adminController.simulateController.advanceRideStatus);

export default router;
