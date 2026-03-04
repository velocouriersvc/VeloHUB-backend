import { Router } from "express";
import { RatingController } from "../controllers/RatingController";
import { apiKeyMiddleware } from "../middleware/api-key-middleware";
import { requireRole } from "../middleware/role-middleware";

const router = Router();
const ratingController = new RatingController();

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

export default router;
