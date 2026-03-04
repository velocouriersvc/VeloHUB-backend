import { Router } from "express";
import { DriverController } from "../controllers/DriverController";
import { apiKeyMiddleware } from "../middleware/api-key-middleware";
import { requireRole } from "../middleware/role-middleware";

const router = Router();
const driverController = new DriverController();

// Apply API Key Middleware to all driver routes
router.use(apiKeyMiddleware);

// All driver routes require driver role
const driverRole = requireRole(["driver"]);

/**
 * @openapi
 * /driver/location:
 *   post:
 *     tags: [Driver]
 *     summary: Update driver's live location
 *     description: Send GPS coordinates to update the driver's position in real-time. Requires **driver** role.
 *     security:
 *       - ApiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/DriverLocationBody'
 *           example:
 *             phoneNumber: "+233501234567"
 *             lat: 5.6037
 *             lng: -0.187
 *             heading: 45.0
 *             speed: 30.5
 *     responses:
 *       200:
 *         description: Location updated
 *       400:
 *         description: lat and lng required
 *       403:
 *         description: Invalid API key or role not approved
 */
router.post("/location", driverRole, driverController.updateLocation);

/**
 * @openapi
 * /driver/online:
 *   post:
 *     tags: [Driver]
 *     summary: Set driver status to online
 *     description: Marks driver as available to receive ride requests. Requires **driver** role.
 *     security:
 *       - ApiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/DriverOnlineBody'
 *           example:
 *             phoneNumber: "+233501234567"
 *             lat: 5.6037
 *             lng: -0.187
 *     responses:
 *       200:
 *         description: Driver is now online
 *       400:
 *         description: lat and lng required
 *       403:
 *         description: Invalid API key or role not approved
 */
router.post("/online", driverRole, driverController.goOnline);

/**
 * @openapi
 * /driver/offline:
 *   post:
 *     tags: [Driver]
 *     summary: Set driver status to offline
 *     description: Marks driver as unavailable. Requires **driver** role.
 *     security:
 *       - ApiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/PhoneOnlyBody'
 *           example:
 *             phoneNumber: "+233501234567"
 *     responses:
 *       200:
 *         description: Driver is now offline
 *       403:
 *         description: Invalid API key or role not approved
 */
router.post("/offline", driverRole, driverController.goOffline);

/**
 * @openapi
 * /driver/rides/{id}/accept:
 *   post:
 *     tags: [Driver]
 *     summary: Accept a ride request
 *     description: Driver accepts an incoming ride request. Requires **driver** role.
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
 *             $ref: '#/components/schemas/AcceptRideBody'
 *           example:
 *             phoneNumber: "+233501234567"
 *             driverName: "Kofi Mensah"
 *     responses:
 *       200:
 *         description: Ride accepted
 *       400:
 *         description: Ride cannot be accepted
 *       403:
 *         description: Invalid API key or role not approved
 */
router.post("/rides/:id/accept", driverRole, driverController.acceptRide);

/**
 * @openapi
 * /driver/rides/{id}/enroute:
 *   post:
 *     tags: [Driver]
 *     summary: Driver is en route to pickup
 *     description: Updates ride status to en_route. Requires **driver** role.
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
 *             $ref: '#/components/schemas/DriverStatusBody'
 *           example:
 *             phoneNumber: "+233501234567"
 *             driverName: "Kofi Mensah"
 *     responses:
 *       200:
 *         description: Status updated to en_route
 *       403:
 *         description: Invalid API key or role not approved
 */
router.post("/rides/:id/enroute", driverRole, driverController.enroute);

/**
 * @openapi
 * /driver/rides/{id}/arrived:
 *   post:
 *     tags: [Driver]
 *     summary: Driver arrived at pickup
 *     description: Updates ride status to arrived. Requires **driver** role.
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
 *             $ref: '#/components/schemas/DriverStatusBody'
 *           example:
 *             phoneNumber: "+233501234567"
 *             driverName: "Kofi Mensah"
 *     responses:
 *       200:
 *         description: Status updated to arrived
 *       403:
 *         description: Invalid API key or role not approved
 */
router.post("/rides/:id/arrived", driverRole, driverController.arrived);

/**
 * @openapi
 * /driver/rides/{id}/start:
 *   post:
 *     tags: [Driver]
 *     summary: Start the ride
 *     description: Begins the trip (passenger picked up). Requires **driver** role.
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
 *             $ref: '#/components/schemas/PhoneOnlyBody'
 *           example:
 *             phoneNumber: "+233501234567"
 *     responses:
 *       200:
 *         description: Ride started
 *       403:
 *         description: Invalid API key or role not approved
 */
router.post("/rides/:id/start", driverRole, driverController.startRide);

/**
 * @openapi
 * /driver/rides/{id}/complete:
 *   post:
 *     tags: [Driver]
 *     summary: Complete the ride
 *     description: Marks ride as completed and triggers payment processing. Requires **driver** role.
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
 *             $ref: '#/components/schemas/PhoneOnlyBody'
 *           example:
 *             phoneNumber: "+233501234567"
 *     responses:
 *       200:
 *         description: Ride completed, payment processed
 *       403:
 *         description: Invalid API key or role not approved
 */
router.post("/rides/:id/complete", driverRole, driverController.completeRide);

/**
 * @openapi
 * /driver/rides/active:
 *   get:
 *     tags: [Driver]
 *     summary: Get driver's current active ride
 *     description: Returns the in-progress ride assigned to this driver. Requires **driver** role.
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/PhoneNumber'
 *     responses:
 *       200:
 *         description: Active ride or null
 *       403:
 *         description: Invalid API key or role not approved
 */
router.get("/rides/active", driverRole, driverController.getActiveRide);

/**
 * @openapi
 * /driver/rides/history:
 *   get:
 *     tags: [Driver]
 *     summary: Get driver's ride history
 *     description: Paginated list of completed rides. Requires **driver** role.
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
router.get("/rides/history", driverRole, driverController.getRideHistory);

/**
 * @openapi
 * /driver/stats:
 *   get:
 *     tags: [Driver]
 *     summary: Get driver stats (rating, total rides, earnings)
 *     description: Returns aggregated driver statistics. Requires **driver** role.
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/PhoneNumber'
 *     responses:
 *       200:
 *         description: Driver stats object
 *       403:
 *         description: Invalid API key or role not approved
 */
router.get("/stats", driverRole, driverController.getStats);

export default router;
