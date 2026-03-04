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
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/RateRideBody'
 *     responses:
 *       201:
 *         description: Rating created
 *       400:
 *         description: Invalid rating or ride not completed
 */
router.post("/", requireRole(["buyer"]), ratingController.rateRide);

/**
 * @openapi
 * /ratings/ride/{rideId}:
 *   get:
 *     tags: [Ratings]
 *     summary: Get rating for a specific ride
 *     parameters:
 *       - name: rideId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - $ref: '#/components/parameters/PhoneNumber'
 *     responses:
 *       200:
 *         description: Rating object or null
 */
router.get("/ride/:rideId", requireRole(["buyer", "driver"]), ratingController.getRideRating);

/**
 * @openapi
 * /ratings/driver/{driverId}:
 *   get:
 *     tags: [Ratings]
 *     summary: Get ratings for a driver
 *     parameters:
 *       - name: driverId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - $ref: '#/components/parameters/PhoneNumber'
 *       - $ref: '#/components/parameters/Limit'
 *       - $ref: '#/components/parameters/Offset'
 *     responses:
 *       200:
 *         description: Paginated list of driver ratings
 */
router.get("/driver/:driverId", requireRole(["buyer", "driver"]), ratingController.getDriverRatings);

export default router;
