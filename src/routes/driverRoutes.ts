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
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/DriverLocationBody'
 *     responses:
 *       200:
 *         description: Location updated
 *       400:
 *         description: lat and lng required
 */
router.post("/location", driverRole, driverController.updateLocation);

/**
 * @openapi
 * /driver/online:
 *   post:
 *     tags: [Driver]
 *     summary: Set driver status to online
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/DriverOnlineBody'
 *     responses:
 *       200:
 *         description: Driver is now online
 *       400:
 *         description: lat and lng required
 */
router.post("/online", driverRole, driverController.goOnline);

/**
 * @openapi
 * /driver/offline:
 *   post:
 *     tags: [Driver]
 *     summary: Set driver status to offline
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [phoneNumber]
 *             properties:
 *               phoneNumber:
 *                 type: string
 *     responses:
 *       200:
 *         description: Driver is now offline
 */
router.post("/offline", driverRole, driverController.goOffline);

/**
 * @openapi
 * /driver/rides/{id}/accept:
 *   post:
 *     tags: [Driver]
 *     summary: Accept a ride request
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
 *             $ref: '#/components/schemas/AcceptRideBody'
 *     responses:
 *       200:
 *         description: Ride accepted
 *       400:
 *         description: Ride cannot be accepted
 */
router.post("/rides/:id/accept", driverRole, driverController.acceptRide);

/**
 * @openapi
 * /driver/rides/{id}/enroute:
 *   post:
 *     tags: [Driver]
 *     summary: Driver is en route to pickup
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
 *             type: object
 *             required: [phoneNumber]
 *             properties:
 *               phoneNumber:
 *                 type: string
 *               driverName:
 *                 type: string
 *     responses:
 *       200:
 *         description: Status updated to en_route
 */
router.post("/rides/:id/enroute", driverRole, driverController.enroute);

/**
 * @openapi
 * /driver/rides/{id}/arrived:
 *   post:
 *     tags: [Driver]
 *     summary: Driver arrived at pickup
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
 *             type: object
 *             required: [phoneNumber]
 *             properties:
 *               phoneNumber:
 *                 type: string
 *               driverName:
 *                 type: string
 *     responses:
 *       200:
 *         description: Status updated to arrived
 */
router.post("/rides/:id/arrived", driverRole, driverController.arrived);

/**
 * @openapi
 * /driver/rides/{id}/start:
 *   post:
 *     tags: [Driver]
 *     summary: Start the ride
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
 *             type: object
 *             required: [phoneNumber]
 *             properties:
 *               phoneNumber:
 *                 type: string
 *     responses:
 *       200:
 *         description: Ride started
 */
router.post("/rides/:id/start", driverRole, driverController.startRide);

/**
 * @openapi
 * /driver/rides/{id}/complete:
 *   post:
 *     tags: [Driver]
 *     summary: Complete the ride
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
 *             type: object
 *             required: [phoneNumber]
 *             properties:
 *               phoneNumber:
 *                 type: string
 *     responses:
 *       200:
 *         description: Ride completed, payment processed
 */
router.post("/rides/:id/complete", driverRole, driverController.completeRide);

/**
 * @openapi
 * /driver/rides/active:
 *   get:
 *     tags: [Driver]
 *     summary: Get driver's current active ride
 *     parameters:
 *       - $ref: '#/components/parameters/PhoneNumber'
 *     responses:
 *       200:
 *         description: Active ride or null
 */
router.get("/rides/active", driverRole, driverController.getActiveRide);

/**
 * @openapi
 * /driver/rides/history:
 *   get:
 *     tags: [Driver]
 *     summary: Get driver's ride history
 *     parameters:
 *       - $ref: '#/components/parameters/PhoneNumber'
 *       - $ref: '#/components/parameters/Limit'
 *       - $ref: '#/components/parameters/Offset'
 *     responses:
 *       200:
 *         description: Paginated ride list
 */
router.get("/rides/history", driverRole, driverController.getRideHistory);

/**
 * @openapi
 * /driver/stats:
 *   get:
 *     tags: [Driver]
 *     summary: Get driver stats (rating, total rides, earnings)
 *     parameters:
 *       - $ref: '#/components/parameters/PhoneNumber'
 *     responses:
 *       200:
 *         description: Driver stats object
 */
router.get("/stats", driverRole, driverController.getStats);

export default router;
