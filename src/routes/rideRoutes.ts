import { Router } from "express";
import { RideController } from "../controllers/RideController";
import { apiKeyMiddleware } from "../middleware/api-key-middleware";
import { requireRole } from "../middleware/role-middleware";

const router = Router();
const rideController = new RideController();

// Apply API Key Middleware to all ride routes
router.use(apiKeyMiddleware);

/**
 * @openapi
 * /rides/estimate:
 *   post:
 *     tags: [Rides]
 *     summary: Get fare estimates for all vehicle types
 *     description: Returns fare estimates for motorbike, car, and van given a trip distance and duration.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/FareEstimateBody'
 *     responses:
 *       200:
 *         description: Array of fare estimates per vehicle type
 *       400:
 *         description: Missing required fields
 *       500:
 *         description: Server error
 */
router.post("/estimate", requireRole(["buyer"]), rideController.getEstimates);

/**
 * @openapi
 * /rides/estimate/{vehicleType}:
 *   post:
 *     tags: [Rides]
 *     summary: Get fare estimate for a specific vehicle type
 *     parameters:
 *       - name: vehicleType
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *           enum: [motorbike, car, van]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/FareEstimateBody'
 *     responses:
 *       200:
 *         description: Single fare estimate
 *       400:
 *         description: Missing required fields
 *       500:
 *         description: Server error
 */
router.post("/estimate/:vehicleType", requireRole(["buyer"]), rideController.getEstimate);

/**
 * @openapi
 * /rides/request:
 *   post:
 *     tags: [Rides]
 *     summary: Request a new ride
 *     description: Creates a ride request and starts the driver matching flow.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/RequestRideBody'
 *     responses:
 *       201:
 *         description: Ride created
 *       400:
 *         description: Missing required fields
 *       500:
 *         description: Server error
 */
router.post("/request", requireRole(["buyer"]), rideController.requestRide);

/**
 * @openapi
 * /rides/{id}/payment:
 *   post:
 *     tags: [Rides]
 *     summary: Set payment method for a ride
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
 *             $ref: '#/components/schemas/SetPaymentBody'
 *     responses:
 *       200:
 *         description: Payment method set
 *       400:
 *         description: Missing or invalid payment method
 */
router.post("/:id/payment", requireRole(["buyer"]), rideController.setPayment);

/**
 * @openapi
 * /rides/{id}/cancel:
 *   post:
 *     tags: [Rides]
 *     summary: Cancel a ride
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
 *             $ref: '#/components/schemas/CancelRideBody'
 *     responses:
 *       200:
 *         description: Ride cancelled
 *       400:
 *         description: Cannot cancel ride in current state
 */
router.post("/:id/cancel", requireRole(["buyer", "driver"]), rideController.cancelRide);

/**
 * @openapi
 * /rides/active:
 *   get:
 *     tags: [Rides]
 *     summary: Get buyer's active ride
 *     description: Returns the current in-progress ride for the authenticated buyer. Send phoneNumber as a query param.
 *     parameters:
 *       - $ref: '#/components/parameters/PhoneNumber'
 *     responses:
 *       200:
 *         description: Active ride or null
 *       401:
 *         description: User ID required
 */
router.get("/active", requireRole(["buyer"]), rideController.getActiveRide);

/**
 * @openapi
 * /rides/history:
 *   get:
 *     tags: [Rides]
 *     summary: Get buyer's ride history
 *     parameters:
 *       - $ref: '#/components/parameters/PhoneNumber'
 *       - $ref: '#/components/parameters/Limit'
 *       - $ref: '#/components/parameters/Offset'
 *     responses:
 *       200:
 *         description: Paginated ride list
 */
router.get("/history", requireRole(["buyer"]), rideController.getRideHistory);

/**
 * @openapi
 * /rides/{id}:
 *   get:
 *     tags: [Rides]
 *     summary: Get ride details by ID
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - $ref: '#/components/parameters/PhoneNumber'
 *     responses:
 *       200:
 *         description: Ride object
 *       404:
 *         description: Ride not found
 */
router.get("/:id", requireRole(["buyer", "driver"]), rideController.getRide);

export default router;
