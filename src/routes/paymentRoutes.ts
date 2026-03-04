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
 *       Called by Paystack when a payment event occurs. **No API key needed** — verified by `x-paystack-signature` header.
 *       You don't call this manually — Paystack sends events here automatically.
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

// Protected routes
router.use(apiKeyMiddleware);

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
