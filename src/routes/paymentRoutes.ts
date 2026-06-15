import { Router } from "express";
import { PaymentController } from "../controllers/PaymentController";
import { apiKeyMiddleware } from "../middleware/api-key-middleware";
import { requireRole } from "../middleware/role-middleware";

const router = Router();
const paymentController = new PaymentController();

/**
 * @openapi
 * /payments/webhook:
 *   post:
 *     tags: [Payments]
 *     summary: Paystack webhook
 *     description: |
 *       Called by Paystack when a payment event occurs. **No API key needed** - verified by `x-paystack-signature` header.
 *       You don't call this manually - Paystack sends events here automatically.
 *     security: []
 *     parameters:
 *       - name: x-paystack-signature
 *         in: header
 *         required: true
 *         description: HMAC signature from Paystack
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Always returns 200 (webhook acknowledged)
 */
router.post("/webhook", paymentController.handleWebhook);

/**
 * @openapi
 * /payments/stripe-webhook:
 *   post:
 *     tags: [Payments]
 *     summary: Stripe webhook
 *     description: |
 *       Called by Stripe when a payment event occurs. **No API key needed** - verified by `stripe-signature` header.
 *       Handles payment_intent.succeeded and payment_intent.payment_failed events.
 *     security: []
 *     parameters:
 *       - name: stripe-signature
 *         in: header
 *         required: true
 *         description: Stripe webhook signature
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Always returns 200 (webhook acknowledged)
 */
router.post("/stripe-webhook", paymentController.handleStripeWebhook);

// Protected routes
router.use(apiKeyMiddleware);

/**
 * @openapi
 * /payments/create-payment-intent:
 *   post:
 *     tags: [Payments]
 *     summary: Create a Stripe PaymentIntent
 *     description: |
 *       Creates a Stripe PaymentIntent for card payments. Returns the `clientSecret`
 *       that the mobile app uses to present the Stripe Payment Sheet.
 *       Requires **buyer** role.
 *     security:
 *       - ApiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [amount]
 *             properties:
 *               amount:
 *                 type: number
 *                 description: Amount in major currency unit (e.g. 5.00 for $5)
 *                 example: 25.50
 *               currency:
 *                 type: string
 *                 description: ISO currency code (defaults to USD)
 *                 example: "USD"
 *               metadata:
 *                 type: object
 *                 description: Additional metadata (rideId, orderId, etc.)
 *     responses:
 *       201:
 *         description: PaymentIntent created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 clientSecret:
 *                   type: string
 *                 paymentIntentId:
 *                   type: string
 *                 paymentId:
 *                   type: string
 *       400:
 *         description: Invalid amount
 *       500:
 *         description: Failed to create payment intent
 */
router.post("/create-payment-intent", requireRole(["buyer"]), paymentController.createPaymentIntent);

/**
 * @openapi
 * /payments/verify/{reference}:
 *   post:
 *     tags: [Payments]
 *     summary: Verify a payment
 *     description: Manually verify a Paystack payment by reference. Requires **buyer** or **driver** role.
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - name: reference
 *         in: path
 *         required: true
 *         description: Paystack payment reference
 *         schema:
 *           type: string
 *         example: "PAY-123456789"
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
 *         description: Payment verification details
 *       404:
 *         description: Payment not found
 *       403:
 *         description: Invalid API key or role not approved
 */
router.post("/verify/:reference", requireRole(["buyer", "driver"]), paymentController.verifyPayment);

/**
 * @openapi
 * /payments/history:
 *   get:
 *     tags: [Payments]
 *     summary: Get payment history
 *     description: Returns paginated list of payments. Requires **buyer** or **driver** role.
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/PhoneNumber'
 *       - $ref: '#/components/parameters/Limit'
 *       - $ref: '#/components/parameters/Offset'
 *     responses:
 *       200:
 *         description: Paginated payment list
 *       403:
 *         description: Invalid API key or role not approved
 */
router.get("/history", requireRole(["buyer", "driver"]), paymentController.getPaymentHistory);

export default router;
