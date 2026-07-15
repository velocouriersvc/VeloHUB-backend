import { Router } from "express";
import { ServiceBookingController } from "../controllers/ServiceBookingController";
import { apiKeyMiddleware } from "../middleware/api-key-middleware";
import { requireRole } from "../middleware/role-middleware";

const router = Router();
const controller = new ServiceBookingController();

// Apply API Key Middleware to all service booking routes
router.use(apiKeyMiddleware);

// Customer routes
/**
 * @openapi
 * /services/bookings:
 *   post:
 *     tags: [Services]
 *     summary: Create a new service booking
 *     description: Initiates a service hire request. Requires **buyer** role.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateBookingBody'
 *     responses:
 *       201:
 *         description: Booking created
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/BookingResponse'
 *       400:
 *         description: Invalid input or user not found
 *       401:
 *         description: Unauthorized
 */
router.post("/", requireRole(["buyer"]), (req, res) => controller.createBooking(req, res));

/**
 * @openapi
 * /services/bookings/quote:
 *   post:
 *     tags: [Services]
 *     summary: Quote a booking (call type + travel fee, locked 15 min)
 *     description: |
 *       Validates in-call/out-call availability and, for out-call, the provider
 *       travel radius (max 20km). The returned travel fee is locked for 15
 *       minutes so provider edits never change an active checkout.
 *     responses:
 *       200:
 *         description: Quote with travelFee, distanceKm, provider timezone, policy
 *       400:
 *         description: Provider does not travel to this area / call type unavailable
 */
router.post("/quote", requireRole(["buyer"]), (req, res) => controller.quoteBooking(req, res));

// Booking chat: customer and provider go back and forth on a booking.
router.get("/:bookingId/messages", requireRole(["buyer", "merchant"]), (req, res) => controller.getMessages(req, res));
router.post("/:bookingId/messages", requireRole(["buyer", "merchant"]), (req, res) => controller.sendMessage(req, res));

/**
 * @openapi
 * /services/bookings/my:
 *   get:
 *     tags: [Services]
 *     summary: Get my bookings (Customer)
 *     description: Retrieves the list of service bookings for the authenticated buyer.
 *     responses:
 *       200:
 *         description: List of bookings
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/BookingResponse'
 */
router.get("/my", requireRole(["buyer"]), (req, res) => controller.getMyBookings(req, res));

// Merchant routes
/**
 * @openapi
 * /services/bookings/merchant:
 *   get:
 *     tags: [Services]
 *     summary: Get merchant bookings
 *     description: Retrieves the list of service bookings for the authenticated merchant.
 *     responses:
 *       200:
 *         description: List of bookings
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/BookingResponse'
 */
router.get("/merchant", requireRole(["merchant"]), (req, res) => controller.getMerchantBookings(req, res));

/**
 * @openapi
 * /services/bookings/{bookingId}:
 *   get:
 *     tags: [Services]
 *     summary: Get booking details
 *     description: Retrieves details for a specific service booking.
 *     parameters:
 *       - in: path
 *         name: bookingId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Booking details
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/BookingResponse'
 *       404:
 *         description: Booking not found
 */
router.get("/:bookingId", requireRole(["buyer", "merchant"]), (req, res) => controller.getBookingById(req, res));

/**
 * @openapi
 * /services/bookings/{bookingId}/status:
 *   patch:
 *     tags: [Services]
 *     summary: Update booking status
 *     description: Updates the status of a service booking (accept, complete, cancel, etc.). Requires **buyer** or **merchant** role.
 *     parameters:
 *       - in: path
 *         name: bookingId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UpdateBookingStatusBody'
 *     responses:
 *       200:
 *         description: Status updated
 *       400:
 *         description: Invalid status transition or booking not found
 *       401:
 *         description: Unauthorized
 */
router.patch("/:bookingId/status", requireRole(["buyer", "merchant"]), (req, res) => controller.updateStatus(req, res));

/**
 * @openapi
 * /services/bookings/{bookingId}/complete:
 *   post:
 *     tags: [Services]
 *     summary: Complete booking via code (Merchant)
 *     description: Merchant provides the 6-character code from the customer to verify and complete the service hire. Requires **merchant** role.
 *     parameters:
 *       - in: path
 *         name: bookingId
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
 *             required: [completionCode]
 *             properties:
 *               completionCode:
 *                 type: string
 *                 example: "A7K3M2"
 *     responses:
 *       200:
 *         description: Service completed and verified
 *       400:
 *         description: Invalid code or wrong status
 *       401:
 *         description: Unauthorized
 */
router.post("/:bookingId/complete", requireRole(["merchant"]), (req, res) => controller.completeBooking(req, res));

export default router;
