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

export default router;
