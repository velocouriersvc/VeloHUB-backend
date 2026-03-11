import { Router } from "express";
import { MerchantController } from "../controllers/MerchantController";
import { apiKeyMiddleware } from "../middleware/api-key-middleware";
import { requireRole } from "../middleware/role-middleware";
import { upload } from "../middleware/upload-middleware";

const router = Router();
const merchantController = new MerchantController();

// Apply API Key Middleware
router.use(apiKeyMiddleware);

const merchantRole = requireRole(["merchant"]);

// ════════════════════════════════════════════════════════════════════
//  DASHBOARD
// ════════════════════════════════════════════════════════════════════

/**
 * @openapi
 * /merchant/dashboard:
 *   get:
 *     tags: [Merchant]
 *     summary: Merchant dashboard
 *     description: Returns profile, stats, today's orders count, pending orders count, and open status. Requires **merchant** role.
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/PhoneNumber'
 *     responses:
 *       200:
 *         description: Dashboard data
 *       404:
 *         description: Merchant profile not found
 *       403:
 *         description: Invalid API key or merchant role not approved
 */
router.get("/dashboard", merchantRole, merchantController.getDashboard);

// ════════════════════════════════════════════════════════════════════
//  PROFILE
// ════════════════════════════════════════════════════════════════════

/**
 * @openapi
 * /merchant/profile:
 *   get:
 *     tags: [Merchant]
 *     summary: Get merchant profile
 *     description: Returns the merchant's business profile. Requires **merchant** role.
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/PhoneNumber'
 *     responses:
 *       200:
 *         description: Merchant profile object
 *       404:
 *         description: Profile not found
 *       403:
 *         description: Invalid API key or merchant role not approved
 */
router.get("/profile", merchantRole, merchantController.getProfile);

/**
 * @openapi
 * /merchant/profile:
 *   put:
 *     tags: [Merchant]
 *     summary: Update merchant profile
 *     description: Update business details like name, description, address, etc. Requires **merchant** role.
 *     security:
 *       - ApiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               businessName:
 *                 type: string
 *               description:
 *                 type: string
 *               businessEmail:
 *                 type: string
 *                 format: email
 *               businessPhone:
 *                 type: string
 *               address:
 *                 type: string
 *               latitude:
 *                 type: number
 *               longitude:
 *                 type: number
 *     responses:
 *       200:
 *         description: Updated profile
 *       404:
 *         description: Profile not found
 *       403:
 *         description: Invalid API key or merchant role not approved
 */
router.put("/profile", merchantRole, merchantController.updateProfile);

/**
 * @openapi
 * /merchant/profile/cover-image:
 *   post:
 *     tags: [Merchant]
 *     summary: Upload cover image
 *     description: Upload a cover image for the merchant profile. Stored in MinIO under "merchants" category. Requires **merchant** role.
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/PhoneNumber'
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
 *         description: Cover image uploaded and profile updated
 *       400:
 *         description: No file provided
 *       403:
 *         description: Invalid API key or merchant role not approved
 */
router.post("/profile/cover-image", merchantRole, upload.single("file"), merchantController.uploadCoverImage);

/**
 * @openapi
 * /merchant/toggle-open:
 *   patch:
 *     tags: [Merchant]
 *     summary: Toggle open/closed status
 *     description: Set merchant as open or closed for business. Requires **merchant** role.
 *     security:
 *       - ApiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [isOpen]
 *             properties:
 *               isOpen:
 *                 type: boolean
 *                 example: true
 *     responses:
 *       200:
 *         description: Updated profile with new isOpen status
 *       400:
 *         description: isOpen boolean is required
 *       404:
 *         description: Profile not found
 *       403:
 *         description: Invalid API key or merchant role not approved
 */
router.patch("/toggle-open", merchantRole, merchantController.toggleOpen);

// ════════════════════════════════════════════════════════════════════
//  OPERATING HOURS
// ════════════════════════════════════════════════════════════════════

/**
 * @openapi
 * /merchant/hours:
 *   get:
 *     tags: [Merchant]
 *     summary: Get operating hours
 *     description: Returns operating hours for all 7 days. Requires **merchant** role.
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/PhoneNumber'
 *     responses:
 *       200:
 *         description: Array of 7 operating hour entries (sorted by dayOfWeek)
 *       403:
 *         description: Invalid API key or merchant role not approved
 */
router.get("/hours", merchantRole, merchantController.getOperatingHours);

/**
 * @openapi
 * /merchant/hours:
 *   put:
 *     tags: [Merchant]
 *     summary: Set all operating hours
 *     description: Upsert operating hours for all days at once. Requires **merchant** role.
 *     security:
 *       - ApiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [hours]
 *             properties:
 *               hours:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required: [dayOfWeek, openTime, closeTime, isClosed]
 *                   properties:
 *                     dayOfWeek:
 *                       type: integer
 *                       minimum: 0
 *                       maximum: 6
 *                       description: "0=Sunday, 6=Saturday"
 *                     openTime:
 *                       type: string
 *                       example: "09:00"
 *                     closeTime:
 *                       type: string
 *                       example: "22:00"
 *                     isClosed:
 *                       type: boolean
 *           example:
 *             hours:
 *               - { dayOfWeek: 0, openTime: "10:00", closeTime: "20:00", isClosed: false }
 *               - { dayOfWeek: 1, openTime: "08:00", closeTime: "22:00", isClosed: false }
 *               - { dayOfWeek: 2, openTime: "08:00", closeTime: "22:00", isClosed: false }
 *               - { dayOfWeek: 3, openTime: "08:00", closeTime: "22:00", isClosed: false }
 *               - { dayOfWeek: 4, openTime: "08:00", closeTime: "22:00", isClosed: false }
 *               - { dayOfWeek: 5, openTime: "08:00", closeTime: "23:00", isClosed: false }
 *               - { dayOfWeek: 6, openTime: "10:00", closeTime: "23:00", isClosed: false }
 *     responses:
 *       200:
 *         description: All operating hours
 *       400:
 *         description: Validation error
 *       403:
 *         description: Invalid API key or merchant role not approved
 */
router.put("/hours", merchantRole, merchantController.setOperatingHours);

/**
 * @openapi
 * /merchant/hours/{dayOfWeek}:
 *   patch:
 *     tags: [Merchant]
 *     summary: Update a single day's hours
 *     description: Update or create operating hours for one day of the week. Requires **merchant** role.
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/PhoneNumber'
 *       - name: dayOfWeek
 *         in: path
 *         required: true
 *         description: "Day of week (0=Sunday, 6=Saturday)"
 *         schema:
 *           type: integer
 *           minimum: 0
 *           maximum: 6
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               openTime:
 *                 type: string
 *                 example: "09:00"
 *               closeTime:
 *                 type: string
 *                 example: "22:00"
 *               isClosed:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Updated day's hours
 *       400:
 *         description: Invalid dayOfWeek
 *       403:
 *         description: Invalid API key or merchant role not approved
 */
router.patch("/hours/:dayOfWeek", merchantRole, merchantController.updateDayHours);

// ════════════════════════════════════════════════════════════════════
//  ORDERS (MERCHANT PERSPECTIVE)
// ════════════════════════════════════════════════════════════════════

/**
 * @openapi
 * /merchant/orders:
 *   get:
 *     tags: [Merchant]
 *     summary: List merchant orders
 *     description: Returns paginated list of orders for the merchant. Optional status filter. Requires **merchant** role.
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/PhoneNumber'
 *       - name: status
 *         in: query
 *         description: Filter by order status
 *         schema:
 *           type: string
 *           enum: [pending, accepted, preparing, ready_for_pickup, driver_assigned, picked_up, in_transit, delivered, completed, cancelled, refunded]
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
 *         description: Paginated order list
 *       403:
 *         description: Invalid API key or merchant role not approved
 */
router.get("/orders", merchantRole, merchantController.getOrders);

/**
 * @openapi
 * /merchant/orders/{orderId}/accept:
 *   patch:
 *     tags: [Merchant]
 *     summary: Accept a pending order
 *     description: Accept a pending order, optionally providing estimated prep time. Notifies customer. Requires **merchant** role.
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/PhoneNumber'
 *       - name: orderId
 *         in: path
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
 *               estimatedPrepTime:
 *                 type: integer
 *                 description: Estimated preparation time in minutes
 *                 example: 20
 *     responses:
 *       200:
 *         description: Order accepted
 *       400:
 *         description: Order not in pending status
 *       404:
 *         description: Order not found
 *       403:
 *         description: Invalid API key or merchant role not approved
 */
router.patch("/orders/:orderId/accept", merchantRole, merchantController.acceptOrder);

/**
 * @openapi
 * /merchant/orders/{orderId}/reject:
 *   patch:
 *     tags: [Merchant]
 *     summary: Reject a pending order
 *     description: Reject a pending order with a reason. Notifies customer. Requires **merchant** role.
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/PhoneNumber'
 *       - name: orderId
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
 *             required: [reason]
 *             properties:
 *               reason:
 *                 type: string
 *                 example: "Item out of stock"
 *     responses:
 *       200:
 *         description: Order rejected
 *       400:
 *         description: Order not in pending status or reason missing
 *       404:
 *         description: Order not found
 *       403:
 *         description: Invalid API key or merchant role not approved
 */
router.patch("/orders/:orderId/reject", merchantRole, merchantController.rejectOrder);

/**
 * @openapi
 * /merchant/orders/{orderId}/status:
 *   patch:
 *     tags: [Merchant]
 *     summary: Update order status
 *     description: |
 *       Merchant can transition order status:
 *       - ACCEPTED → PREPARING
 *       - PREPARING → READY_FOR_PICKUP
 *
 *       Notifies customer on each transition. Requires **merchant** role.
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/PhoneNumber'
 *       - name: orderId
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
 *             required: [status]
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [preparing, ready_for_pickup]
 *     responses:
 *       200:
 *         description: Order status updated
 *       400:
 *         description: Invalid status transition
 *       404:
 *         description: Order not found
 *       403:
 *         description: Invalid API key or merchant role not approved
 */
router.patch("/orders/:orderId/status", merchantRole, merchantController.updateOrderStatus);

/**
 * @openapi
 * /merchant/orders/{orderId}/verify-pickup:
 *   post:
 *     tags: [Merchant]
 *     summary: Verify pickup code
 *     description: |
 *       Driver shows the 6-digit pickup code to merchant. Merchant verifies it.
 *       On success, order transitions to PICKED_UP and customer is notified.
 *       Requires **merchant** role.
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/PhoneNumber'
 *       - name: orderId
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
 *             required: [code]
 *             properties:
 *               code:
 *                 type: string
 *                 example: "123456"
 *     responses:
 *       200:
 *         description: Pickup verified — order moved to picked_up
 *       400:
 *         description: Invalid code or wrong order status
 *       404:
 *         description: Order not found
 *       403:
 *         description: Invalid API key or merchant role not approved
 */
router.post("/orders/:orderId/verify-pickup", merchantRole, merchantController.verifyPickupCode);

// ════════════════════════════════════════════════════════════════════
//  FINANCES & STATS
// ════════════════════════════════════════════════════════════════════

/**
 * @openapi
 * /merchant/finances:
 *   get:
 *     tags: [Merchant]
 *     summary: Financial overview
 *     description: Returns wallet balance, total earnings, pending settlement, and recent transactions. Requires **merchant** role.
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/PhoneNumber'
 *     responses:
 *       200:
 *         description: Financial overview
 *       403:
 *         description: Invalid API key or merchant role not approved
 */
router.get("/finances", merchantRole, merchantController.getFinances);

/**
 * @openapi
 * /merchant/stats:
 *   get:
 *     tags: [Merchant]
 *     summary: Merchant stats
 *     description: Returns total orders, revenue, average rating, rating count, and total products. Requires **merchant** role.
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/PhoneNumber'
 *     responses:
 *       200:
 *         description: Merchant stats object
 *       403:
 *         description: Invalid API key or merchant role not approved
 */
router.get("/stats", merchantRole, merchantController.getStats);

export default router;
