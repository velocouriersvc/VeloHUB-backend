import { Request, Response } from "express";
import { AuthRequest } from "../middleware/role-middleware";
import { PaymentService } from "../services/payment/payment-service";
import { WalletService } from "../services/wallet-service";
import { createServiceLogger } from "../utils/logger";

const log = createServiceLogger("PaymentController");

export class PaymentController {
    private paymentService = new PaymentService();
    private walletService = new WalletService();

    /**
     * POST /payments/webhook
     * Handle Paystack webhook (no auth — verified by signature)
     */
    handleWebhook = async (req: Request, res: Response) => {
        try {
            const signature = req.headers["x-paystack-signature"] as string;

            if (!signature) {
                return res.status(400).json({ message: "Missing signature" });
            }

            const payload = JSON.stringify(req.body);
            await this.paymentService.handleWebhook(payload, signature);

            // Always respond 200 to Paystack
            return res.status(200).json({ message: "ok" });
        } catch (error) {
            log.error("Webhook error", { error: (error as Error).message });
            // Still return 200 to prevent retries on our errors
            return res.status(200).json({ message: "ok" });
        }
    };

    /**
     * POST /payments/stripe-webhook
     * Handle Stripe webhook (no auth — verified by stripe-signature header)
     */
    handleStripeWebhook = async (req: Request, res: Response) => {
        try {
            const signature = req.headers["stripe-signature"] as string;

            if (!signature) {
                return res.status(400).json({ message: "Missing stripe-signature" });
            }

            // Use raw body for Stripe signature verification
            const payload = typeof req.body === "string" ? req.body : JSON.stringify(req.body);
            await this.paymentService.handleStripeWebhook(payload, signature);

            return res.status(200).json({ received: true });
        } catch (error) {
            log.error("Stripe webhook error", { error: (error as Error).message });
            return res.status(200).json({ received: true });
        }
    };

    /**
     * POST /payments/create-payment-intent
     * Create a Stripe PaymentIntent for card payments.
     * Returns clientSecret for the mobile app to present the Payment Sheet.
     */
    createPaymentIntent = async (req: AuthRequest, res: Response) => {
        try {
            const userId = req.user?.id;
            if (!userId) {
                return res.status(401).json({ message: "User ID required" });
            }

            const { amount, currency, metadata } = req.body;

            if (!amount || amount <= 0) {
                return res.status(400).json({ message: "Valid amount is required" });
            }

            const result = await this.paymentService.createPaymentIntent({
                userId,
                amount: Number(amount),
                currency: currency || "USD",
                metadata: metadata || {},
            });

            if (!result.success) {
                return res.status(500).json({
                    message: "Failed to create payment intent",
                });
            }

            return res.status(201).json({
                clientSecret: result.clientSecret,
                paymentIntentId: result.paymentIntentId,
                paymentId: result.paymentId,
            });
        } catch (error) {
            log.error("Error creating payment intent", {
                error: (error as Error).message,
            });
            return res.status(500).json({ message: "Internal server error" });
        }
    };

    /**
     * POST /payments/verify/:reference
     * Manually verify a payment
     */
    verifyPayment = async (req: AuthRequest, res: Response) => {
        try {
            const reference = req.params.reference;
            const payment = await this.paymentService.confirmPayment(reference);

            if (!payment) {
                return res.status(404).json({ message: "Payment not found" });
            }

            return res.json({ payment });
        } catch (error) {
            log.error("Error verifying payment", { error: (error as Error).message });
            return res.status(500).json({ message: "Internal server error" });
        }
    };

    /**
     * GET /payments/history
     * Get user's payment history
     */
    getPaymentHistory = async (req: AuthRequest, res: Response) => {
        try {
            const userId = req.user?.id;
            if (!userId) return res.status(401).json({ message: "User ID required" });

            const limit = Number(req.query.limit) || 20;
            const offset = Number(req.query.offset) || 0;

            const result = await this.paymentService.getUserPayments(userId, limit, offset);
            return res.json(result);
        } catch (error) {
            log.error("Error getting payment history", { error: (error as Error).message });
            return res.status(500).json({ message: "Internal server error" });
        }
    };
}
