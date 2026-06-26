import { Router } from "express";
import { RatingController } from "../controllers/RatingController";
import { OrderRatingController } from "../controllers/OrderRatingController";
import { apiKeyMiddleware } from "../middleware/api-key-middleware";
import { requireRole } from "../middleware/role-middleware";
import { validate, body } from "../middleware/validate";

const router = Router();
const ratingController = new RatingController();
const orderRatingController = new OrderRatingController();

// Apply API Key Middleware
router.use(apiKeyMiddleware);

/**
 * @openapi
 * /ratings:
 *   post:
 *     tags: [Ratings]
 *     summary: Rate a completed ride
 *     description: Submit a 1-5 star rating with optional comment for a completed ride. Requires **buyer** role.
 *     security:
 *       - ApiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/RateRideBody'
 *           example:
 *             phoneNumber: "+233501234567"
 *             rideId: "550e8400-e29b-41d4-a716-446655440000"
 *             rating: 5
 *             comment: "Great ride, very safe!"
 *     responses:
 *       201:
 *         description: Rating created
 *       400:
 *         description: Invalid rating or ride not completed
 *       403:
 *         description: Invalid API key or role not approved
 */
router.post("/", requireRole(["buyer"]), ratingController.rateRide);

/**
 * @openapi
 * /ratings/ride/{rideId}:
 *   get:
 *     tags: [Ratings]
 *     summary: Get rating for a specific ride
 *     description: Returns the rating for a given ride. Requires **buyer** or **driver** role.
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - name: rideId
 *         in: path
 *         required: true
 *         description: Ride ID (UUID)
 *         schema:
 *           type: string
 *           format: uuid
 *         example: "550e8400-e29b-41d4-a716-446655440000"
 *       - $ref: '#/components/parameters/PhoneNumber'
 *     responses:
 *       200:
 *         description: Rating object or null
 *       403:
 *         description: Invalid API key or role not approved
 */
router.get("/ride/:rideId", requireRole(["buyer", "driver"]), ratingController.getRideRating);

/**
 * @openapi
 * /ratings/driver/{driverId}:
 *   get:
 *     tags: [Ratings]
 *     summary: Get ratings for a driver
 *     description: Returns paginated list of ratings for a specific driver. Requires **buyer** or **driver** role.
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - name: driverId
 *         in: path
 *         required: true
 *         description: Driver's user ID (UUID)
 *         schema:
 *           type: string
 *           format: uuid
 *         example: "550e8400-e29b-41d4-a716-446655440000"
 *       - $ref: '#/components/parameters/PhoneNumber'
 *       - $ref: '#/components/parameters/Limit'
 *       - $ref: '#/components/parameters/Offset'
 *     responses:
 *       200:
 *         description: Paginated list of driver ratings
 *       403:
 *         description: Invalid API key or role not approved
 */
router.get("/driver/:driverId", requireRole(["buyer", "driver"]), ratingController.getDriverRatings);

// ════════════════════════════════════════════════════════════════════
//  MARKETPLACE ORDER RATINGS
// ════════════════════════════════════════════════════════════════════

/**
 * @openapi
 * /ratings/order:
 *   post:
 *     tags: [Ratings]
 *     summary: Rate a completed marketplace order
 *     description: |
 *       Submit a 1-5 star rating for the merchant and optionally the driver
 *       on a completed marketplace order.
 *
 *       - Updates merchant average rating + total reviews
 *       - Notifies merchant (and driver if rated)
 *       - Each order can only be rated once
 *
 *       Requires **buyer** role.
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
 *             required: [orderId, merchantRating]
 *             properties:
 *               orderId:
 *                 type: string
 *                 format: uuid
 *               merchantRating:
 *                 type: integer
 *                 minimum: 1
 *                 maximum: 5
 *               merchantComment:
 *                 type: string
 *                 maxLength: 500
 *               driverRating:
 *                 type: integer
 *                 minimum: 1
 *                 maximum: 5
 *                 description: Optional - only if order had a delivery driver
 *               driverComment:
 *                 type: string
 *                 maxLength: 500
 *           example:
 *             orderId: "550e8400-e29b-41d4-a716-446655440000"
 *             merchantRating: 5
 *             merchantComment: "Amazing food, well packaged!"
 *             driverRating: 4
 *             driverComment: "Fast delivery"
 *     responses:
 *       201:
 *         description: Rating submitted
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 rating:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     orderId:
 *                       type: string
 *                     merchantRating:
 *                       type: integer
 *                     merchantComment:
 *                       type: string
 *                     driverRating:
 *                       type: integer
 *                       nullable: true
 *                     driverComment:
 *                       type: string
 *                       nullable: true
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *       400:
 *         description: Order not completed, already rated, or invalid rating value
 *       403:
 *         description: You do not own this order
 *       404:
 *         description: Order not found
 */
router.post("/order", requireRole(["buyer"]), validate([
    body("orderId").required().isUUID(),
    body("merchantRating").required().isNumber().min(1).max(5),
    body("deliveryRating").optional().isNumber().min(1).max(5),
]), orderRatingController.rateOrder);

/**
 * @openapi
 * /ratings/order/{orderId}:
 *   get:
 *     tags: [Ratings]
 *     summary: Get rating for a marketplace order
 *     description: |
 *       Returns the rating for a given marketplace order, or null if not yet rated.
 *       Requires **buyer**, **merchant**, or **driver** role.
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: orderId
 *         required: true
 *         description: Order ID (UUID)
 *         schema:
 *           type: string
 *           format: uuid
 *       - $ref: '#/components/parameters/PhoneNumber'
 *     responses:
 *       200:
 *         description: Rating object or null
 *       403:
 *         description: Invalid API key or role not approved
 */
router.get("/order/:orderId", requireRole(["buyer", "merchant", "driver"]), orderRatingController.getOrderRating);

/**
 * @openapi
 * /ratings/merchant/{merchantId}:
 *   get:
 *     tags: [Ratings]
 *     summary: Get public reviews for a merchant
 *     description: |
 *       Paginated list of marketplace order ratings and reviews for a specific merchant.
 *       Accessible by any authenticated user.
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: merchantId
 *         required: true
 *         description: Merchant's user ID (UUID)
 *         schema:
 *           type: string
 *           format: uuid
 *       - $ref: '#/components/parameters/PhoneNumber'
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
 *         description: Paginated list of merchant reviews
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ratings:
 *                   type: array
 *                   items:
 *                     type: object
 *                 total:
 *                   type: integer
 *                 page:
 *                   type: integer
 *                 limit:
 *                   type: integer
 *       403:
 *         description: Invalid API key or role not approved
 */
router.get("/merchant/:merchantId", requireRole(["buyer", "merchant", "driver", "admin"]), orderRatingController.getMerchantRatings);

export default router;
