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
 *     description: |
 *       Returns fare estimates for motorbike, car, and van given a trip distance and duration.
 *       Requires **buyer** role.
 *     security:
 *       - ApiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/FareEstimateBody'
 *           example:
 *             phoneNumber: "+233501234567"
 *             distanceKm: 5.2
 *             durationMin: 15
 *             pickupLat: 5.6037
 *             pickupLng: -0.187
 *     responses:
 *       200:
 *         description: Array of fare estimates per vehicle type
 *       400:
 *         description: Missing required fields
 *       403:
 *         description: Invalid API key or role not approved
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
 *     description: Returns fare for one vehicle type. Requires **buyer** role.
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - name: vehicleType
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *           enum: [motorbike, car, van]
 *         example: motorbike
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/FareEstimateBody'
 *           example:
 *             phoneNumber: "+233501234567"
 *             distanceKm: 5.2
 *             durationMin: 15
 *             pickupLat: 5.6037
 *             pickupLng: -0.187
 *     responses:
 *       200:
 *         description: Single fare estimate
 *       400:
 *         description: Missing required fields
 *       403:
 *         description: Invalid API key or role not approved
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
 *     description: |
 *       Creates a ride request and starts the driver matching flow. Requires **buyer** role.
 *       You can add intermediate stops and safety contacts.
 *     security:
 *       - ApiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/RequestRideBody'
 *           example:
 *             phoneNumber: "+233501234567"
 *             type: "ride"
 *             pickupAddress: "Accra Mall, Tetteh Quarshie"
 *             pickupLat: 5.6037
 *             pickupLng: -0.187
 *             dropoffAddress: "University of Ghana, Legon"
 *             dropoffLat: 5.6502
 *             dropoffLng: -0.1869
 *             vehicleType: "motorbike"
 *             distanceKm: 5.2
 *             durationMin: 15
 *     responses:
 *       201:
 *         description: Ride created
 *       400:
 *         description: Missing required fields
 *       403:
 *         description: Invalid API key or role not approved
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
 *     description: Choose how to pay for a ride (cash, wallet, or mobile money). Requires **buyer** role.
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         description: Ride ID (UUID)
 *         schema:
 *           type: string
 *           format: uuid
 *         example: "550e8400-e29b-41d4-a716-446655440000"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/SetPaymentBody'
 *           example:
 *             phoneNumber: "+233501234567"
 *             paymentMethod: "mobile_money"
 *             email: "kwame@example.com"
 *     responses:
 *       200:
 *         description: Payment method set
 *       400:
 *         description: Missing or invalid payment method
 *       403:
 *         description: Invalid API key or role not approved
 */
router.post("/:id/payment", requireRole(["buyer"]), rideController.setPayment);

/**
 * @openapi
 * /rides/{id}/cancel:
 *   post:
 *     tags: [Rides]
 *     summary: Cancel a ride
 *     description: Cancel a pending or in-progress ride. Requires **buyer** or **driver** role.
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         description: Ride ID (UUID)
 *         schema:
 *           type: string
 *           format: uuid
 *         example: "550e8400-e29b-41d4-a716-446655440000"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CancelRideBody'
 *           example:
 *             phoneNumber: "+233501234567"
 *             reason: "Changed my mind"
 *     responses:
 *       200:
 *         description: Ride cancelled
 *       400:
 *         description: Cannot cancel ride in current state
 *       403:
 *         description: Invalid API key or role not approved
 */
router.post("/:id/cancel", requireRole(["buyer", "driver"]), rideController.cancelRide);

/**
 * @openapi
 * /rides/active:
 *   get:
 *     tags: [Rides]
 *     summary: Get buyer's active ride
 *     description: Returns the current in-progress ride for the authenticated buyer. Requires **buyer** role.
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/PhoneNumber'
 *     responses:
 *       200:
 *         description: Active ride object or null
 *       401:
 *         description: User ID required
 *       403:
 *         description: Invalid API key or role not approved
 */
router.get("/active", requireRole(["buyer"]), rideController.getActiveRide);

/**
 * @openapi
 * /rides/history:
 *   get:
 *     tags: [Rides]
 *     summary: Get buyer's ride history
 *     description: Returns paginated list of completed rides. Requires **buyer** role.
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/PhoneNumber'
 *       - $ref: '#/components/parameters/Limit'
 *       - $ref: '#/components/parameters/Offset'
 *     responses:
 *       200:
 *         description: Paginated ride list
 *       403:
 *         description: Invalid API key or role not approved
 */
router.get("/history", requireRole(["buyer"]), rideController.getRideHistory);

/**
 * @openapi
 * /rides/{id}:
 *   get:
 *     tags: [Rides]
 *     summary: Get ride details by ID
 *     description: Returns full ride object with stops and contacts. Requires **buyer** or **driver** role.
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - name: id
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
 *         description: Ride object
 *       404:
 *         description: Ride not found
 *       403:
 *         description: Invalid API key or role not approved
 */
router.get("/:id", requireRole(["buyer", "driver"]), rideController.getRide);

/**
 * @openapi
 * /rides/nearby-drivers:
 *   post:
 *     tags: [Rides]
 *     summary: Get nearby available drivers
 *     description: Returns a list of nearby drivers for the map overlay.
 *     security:
 *       - ApiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [lat, lng]
 *             properties:
 *               lat:
 *                 type: number
 *               lng:
 *                 type: number
 *               radiusKm:
 *                 type: number
 *                 default: 10
 *     responses:
 *       200:
 *         description: List of nearby drivers with coordinates
 */
router.post("/nearby-drivers", requireRole(["buyer"]), rideController.getNearbyDrivers);

export default router;
