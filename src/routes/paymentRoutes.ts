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
 *     description: Called by Paystack when a payment event occurs. No API key needed — verified by `x-paystack-signature` header.
 *     security: []
 *     parameters:
 *       - name: x-paystack-signature
 *         in: header
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Always returns 200
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
 *     description: Manually verify a Paystack payment by reference.
 *     parameters:
 *       - name: reference
 *         in: path
 *         required: true
 *         schema:
 *           type: string
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
 *         description: Payment details
 *       404:
 *         description: Payment not found
 */
router.post("/verify/:reference", requireRole(["buyer", "driver"]), paymentController.verifyPayment);

/**
 * @openapi
 * /payments/history:
 *   get:
 *     tags: [Payments]
 *     summary: Get payment history
 *     parameters:
 *       - $ref: '#/components/parameters/PhoneNumber'
 *       - $ref: '#/components/parameters/Limit'
 *       - $ref: '#/components/parameters/Offset'
 *     responses:
 *       200:
 *         description: Paginated payment list
 */
router.get("/history", requireRole(["buyer", "driver"]), paymentController.getPaymentHistory);

export default router;
