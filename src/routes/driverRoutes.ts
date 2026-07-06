import { Router } from "express";
import { DriverController } from "../controllers/DriverController";
import { DeliveryController } from "../controllers/DeliveryController";
import { apiKeyMiddleware } from "../middleware/api-key-middleware";
import { requireRole } from "../middleware/role-middleware";
import { validate, body } from "../middleware/validate";
import { OrderStatus } from "../models/order";

const router = Router();
const driverController = new DriverController();
const deliveryController = new DeliveryController();

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
 * /driver/rides/available:
 *   get:
 *     tags: [Driver]
 *     summary: List pending ride requests the driver can accept
 *     description: Recent unassigned rides still searching for a driver. Requires **driver** role.
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/PhoneNumber'
 *       - in: query
 *         name: lat
 *         schema: { type: number }
 *       - in: query
 *         name: lng
 *         schema: { type: number }
 *     responses:
 *       200:
 *         description: List of available rides
 */
router.get("/rides/available", driverRole, driverController.getAvailableRides);

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

// ════════════════════════════════════════════════════════════════════
//  DRIVER PROFILE
// ════════════════════════════════════════════════════════════════════

/**
 * @openapi
 * /driver/profile:
 *   get:
 *     tags: [Driver]
 *     summary: Get driver's own profile
 *     description: Returns the driver's profile including vehicle info, documents, and verification status.
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/PhoneNumber'
 *     responses:
 *       200:
 *         description: Driver profile object
 *       404:
 *         description: Driver profile not found
 */
router.get("/profile", driverRole, driverController.getProfile);

/**
 * @openapi
 * /driver/profile:
 *   put:
 *     tags: [Driver]
 *     summary: Update driver's own profile
 *     description: Update name, vehicle model, color, or plate number.
 *     security:
 *       - ApiKeyAuth: []
 *     responses:
 *       200:
 *         description: Profile updated
 */
router.put("/profile", driverRole, driverController.updateProfile);

// ════════════════════════════════════════════════════════════════════
//  MARKETPLACE DELIVERIES
// ════════════════════════════════════════════════════════════════════

/**
 * @openapi
 * /driver/deliveries/available:
 *   get:
 *     tags: [Driver - Deliveries]
 *     summary: List available marketplace deliveries
 *     description: |
 *       Returns marketplace orders that are **READY_FOR_PICKUP** and need a driver.
 *       Optionally filter by proximity to driver's current location.
 *       Ordered by oldest first (FIFO).
 *       Requires **driver** role.
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/PhoneNumber'
 *       - in: query
 *         name: lat
 *         schema:
 *           type: number
 *         description: Driver's current latitude
 *       - in: query
 *         name: lng
 *         schema:
 *           type: number
 *         description: Driver's current longitude
 *       - in: query
 *         name: radiusKm
 *         schema:
 *           type: number
 *           default: 10
 *         description: Search radius in km (default 10)
 *     responses:
 *       200:
 *         description: List of available deliveries
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 deliveries:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       orderId:
 *                         type: string
 *                       orderNumber:
 *                         type: string
 *                       merchantName:
 *                         type: string
 *                       merchantLat:
 *                         type: number
 *                       merchantLng:
 *                         type: number
 *                       deliveryAddress:
 *                         type: string
 *                       deliveryLat:
 *                         type: number
 *                       deliveryLng:
 *                         type: number
 *                       estimatedDistanceKm:
 *                         type: number
 *                       deliveryFee:
 *                         type: number
 *                       itemCount:
 *                         type: integer
 *                       currency:
 *                         type: string
 *                       createdAt:
 *                         type: string
 *                         format: date-time
 *                 total:
 *                   type: integer
 *       403:
 *         description: Invalid API key or role not approved
 */
router.get("/deliveries/available", driverRole, deliveryController.getAvailableDeliveries);

/**
 * @openapi
 * /driver/deliveries/active:
 *   get:
 *     tags: [Driver - Deliveries]
 *     summary: Get driver's current active delivery
 *     description: |
 *       Returns the in-progress marketplace delivery assigned to this driver, or null.
 *       Requires **driver** role.
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/PhoneNumber'
 *     responses:
 *       200:
 *         description: Active delivery order or null
 *       403:
 *         description: Invalid API key or role not approved
 */
router.get("/deliveries/active", driverRole, deliveryController.getActiveDelivery);

/**
 * @openapi
 * /driver/deliveries/history:
 *   get:
 *     tags: [Driver - Deliveries]
 *     summary: Get driver's delivery history
 *     description: |
 *       Paginated list of completed marketplace deliveries.
 *       Requires **driver** role.
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
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
 *         description: Paginated delivery list
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 deliveries:
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
router.get("/deliveries/history", driverRole, deliveryController.getDeliveryHistory);

/**
 * @openapi
 * /driver/deliveries/{orderId}/accept:
 *   post:
 *     tags: [Driver - Deliveries]
 *     summary: Accept a marketplace delivery
 *     description: |
 *       Driver accepts a delivery order. Uses a Redis lock to prevent double-accept.
 *       Sets order status to **DRIVER_ASSIGNED**.
 *       Notifies customer and merchant.
 *       Requires **driver** role.
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/PhoneNumber'
 *       - in: path
 *         name: orderId
 *         required: true
 *         description: Order ID (UUID)
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Delivery accepted
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
 *                     deliveryAddress:
 *                       type: string
 *                     deliveryFee:
 *                       type: number
 *       404:
 *         description: Order not found
 *       409:
 *         description: Delivery already accepted by another driver
 */
router.post("/deliveries/:orderId/accept", driverRole, deliveryController.acceptDelivery);

/**
 * @openapi
 * /driver/deliveries/{orderId}/cancel:
 *   post:
 *     tags: [Driver - Deliveries]
 *     summary: Cancel a delivery assignment
 *     description: |
 *       Driver cancels a delivery assignment they previously accepted.
 *       Only allowed **before** the order is marked as **picked_up**.
 *       Resets order status to **READY_FOR_DELIVERY** and clears driver assignment.
 *       Notifies the merchant.
 *       Requires **driver** role.
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/PhoneNumber'
 *       - in: path
 *         name: orderId
 *         required: true
 *         description: Order ID (UUID)
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
 *                 description: Reason for cancellation
 *     responses:
 *       200:
 *         description: Delivery assignment cancelled
 *       400:
 *         description: Cannot cancel (already picked up or not assigned)
 *       404:
 *         description: Order not found
 */
router.post("/deliveries/:orderId/cancel", driverRole, deliveryController.cancelDeliveryAssignment);

/**
 * @openapi
 * /driver/deliveries/{orderId}/status:
 *   patch:
 *     tags: [Driver - Deliveries]
 *     summary: Update delivery status
 *     description: |
 *       Transition delivery status through the lifecycle:
 *       - **picked_up** - Driver has picked up items from merchant
 *       - **in_transit** - Driver is on the way to customer
 *       - **delivered** - Items delivered to customer
 *
 *       Notifies customer and merchant on each transition.
 *       Requires **driver** role.
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/PhoneNumber'
 *       - in: path
 *         name: orderId
 *         required: true
 *         description: Order ID (UUID)
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
 *                 enum: [picked_up, in_transit, delivered]
 *     responses:
 *       200:
 *         description: Status updated
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
 *                     pickedUpAt:
 *                       type: string
 *                       format: date-time
 *                       nullable: true
 *                     deliveredAt:
 *                       type: string
 *                       format: date-time
 *                       nullable: true
 *       400:
 *         description: Invalid transition or not assigned to this driver
 *       404:
 *         description: Order not found
 */
router.patch("/deliveries/:orderId/status", driverRole, validate([
    body("status").required().isIn([OrderStatus.PICKED_UP, OrderStatus.IN_TRANSIT, OrderStatus.DELIVERED]),
]), deliveryController.updateDeliveryStatus);

/**
 * @openapi
 * /driver/deliveries/{orderId}/complete:
 *   post:
 *     tags: [Driver - Deliveries]
 *     summary: Complete a delivery and trigger settlement
 *     description: |
 *       Marks the delivery as **DELIVERED** (if not already) and triggers the settlement flow.
 *
 *       **Settlement logic (depends on payment method):**
 *       - **Cash delivery:** Driver collected cash → wallet debited for merchant + platform shares, merchant wallet credited
 *       - **Online delivery:** Platform holds funds → merchant wallet credited with earnings, driver wallet credited with delivery fee
 *
 *       Returns settlement breakdown with earnings.
 *       Requires **driver** role.
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/PhoneNumber'
 *       - in: path
 *         name: orderId
 *         required: true
 *         description: Order ID (UUID)
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Delivery completed and settled
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
 *                     deliveredAt:
 *                       type: string
 *                       format: date-time
 *                 settlement:
 *                   type: object
 *                   nullable: true
 *                   properties:
 *                     settlementType:
 *                       type: string
 *                     merchantEarnings:
 *                       type: number
 *                     driverEarnings:
 *                       type: number
 *                     platformFee:
 *                       type: number
 *       400:
 *         description: Cannot complete - not assigned or invalid state
 *       404:
 *         description: Order not found
 */
router.post("/deliveries/:orderId/complete", driverRole, deliveryController.completeDelivery);

/**
 * @openapi
 * /driver/deliveries/{orderId}/verify-delivery-code:
 *   post:
 *     tags: [Driver - Deliveries]
 *     summary: Verify delivery code given by customer
 *     description: |
 *       Driver submits the code provided by the customer/buyer to confirm delivery ownership.
 *       On success the order transitions to DELIVERED and deliveryCodeVerifiedAt is set.
 *       Max 5 attempts per order per hour.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: orderId
 *         required: true
 *         schema:
 *           type: string
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
 *                 example: "A3BX7Q"
 *     responses:
 *       200:
 *         description: Code verified, order marked as delivered
 *       400:
 *         description: Invalid code
 *       429:
 *         description: Too many attempts
 */
router.post(
    "/deliveries/:orderId/verify-delivery-code",
    driverRole,
    validate([body("code").required("Delivery code is required")]),
    deliveryController.verifyDeliveryCode
);

/**
 * @openapi
 * /driver/surge:
 *   get:
 *     tags: [Driver - Rides]
 *     summary: Get current surge multiplier
 *     description: Returns the current surge multiplier for the driver's country.
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/PhoneNumber'
 *       - in: query
 *         name: country
 *         schema:
 *           type: string
 *           default: GH
 *     responses:
 *       200:
 *         description: Current surge multiplier
 */
router.get("/surge", driverRole, driverController.getSurge);

export default router;
