import { Request, Response } from "express";
import { AuthRequest } from "../middleware/role-middleware";
import { PaymentService } from "../services/payment/payment-service";
import { PaymentRecordStatus } from "../models/payment";
import { WalletService } from "../services/wallet-service";
import { createServiceLogger } from "../utils/logger";

const log = createServiceLogger("PaymentController");

export class PaymentController {
    private paymentService = new PaymentService();
    private walletService = new WalletService();

    /**
     * POST /payments/webhook
     * Handle Paystack webhook (no auth - verified by signature)
     */
    handleWebhook = async (req: Request, res: Response) => {
        try {
            const signature = req.headers["x-paystack-signature"] as string;

            if (!signature) {
                return res.status(400).json({ message: "Missing signature" });
            }

            // The webhook route is mounted with express.raw, so req.body is a Buffer.
            // The Paystack signature is an HMAC over the exact raw bytes, so we must hash
            // the raw string, not JSON.stringify(Buffer) (which yields {"type":"Buffer",...}).
            const payload = Buffer.isBuffer(req.body) ? req.body.toString("utf8") : JSON.stringify(req.body);
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
     * Handle Stripe webhook (no auth - verified by stripe-signature header)
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
     * GET /payments/callback
     * Public browser-return page after Paystack checkout. Verifies the
     * transaction and shows a friendly result; also the URL the in-app
     * WebView intercepts, so this must never render raw JSON.
     */
    handlePaymentCallback = async (req: Request, res: Response) => {
        const reference = String(req.query.reference || req.query.trxref || "");
        let state: "success" | "failed" | "pending" = "pending";
        try {
            if (reference) {
                const payment = await this.paymentService.confirmPayment(reference)
                    || await this.paymentService.getPaymentByReference(reference);
                if (payment?.status === "success") state = "success";
                else if (payment?.status === "failed") state = "failed";
            }
        } catch (error) {
            log.error("Payment callback error", { reference, error: (error as Error).message });
        }
        const view = {
            success: { icon: "&#10003;", color: "#10B981", title: "Payment successful", body: "You can return to the Velo app. Your ride or order is being confirmed." },
            failed: { icon: "&#10007;", color: "#EF4444", title: "Payment failed", body: "The payment could not be completed. Return to the Velo app and try again." },
            pending: { icon: "&#8987;", color: "#F59E0B", title: "Payment processing", body: "We are confirming your payment. Return to the Velo app; it will update automatically." },
        }[state];
        return res.status(200).send(`<!doctype html>
<html><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>Velo Payment</title></head>
<body style="margin:0;font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#fafafa;display:flex;align-items:center;justify-content:center;min-height:100vh;text-align:center">
<div style="padding:32px;max-width:340px">
<div style="width:72px;height:72px;border-radius:50%;background:${view.color}1a;color:${view.color};font-size:34px;line-height:72px;margin:0 auto 20px">${view.icon}</div>
<h1 style="font-size:22px;margin:0 0 8px;color:#18181b">${view.title}</h1>
<p style="font-size:15px;color:#71717a;margin:0">${view.body}</p>
</div></body></html>`);
    };

    /**
     * GET /payments/status/:reference
     * Poll payment status (in-app WebView flow).
     */
    getPaymentStatus = async (req: AuthRequest, res: Response) => {
        try {
            const userId = req.user?.id;
            if (!userId) return res.status(401).json({ message: "User ID required" });
            const reference = req.params.reference;
            let payment = await this.paymentService.getPaymentByReference(reference);
            if (!payment || payment.userId !== userId) {
                return res.status(404).json({ message: "Payment not found" });
            }
            // Self-confirming poll: while the payment is still pending, re-verify it with
            // the gateway on every poll. This is the reliable path (the webhook/browser
            // callback can be delayed or missed, especially for mobile money where the
            // charge completes out-of-band on the phone), so the ride/order confirms and
            // dispatches within seconds of the customer paying - not only if a webhook
            // happens to arrive. confirmPayment is idempotent.
            if (payment.status === PaymentRecordStatus.PENDING) {
                // Poll mode (failOnNonSuccess=false): only promote to SUCCESS, never mark
                // an in-progress payment failed.
                const confirmed = await this.paymentService.confirmPayment(reference, undefined, false).catch((e) => {
                    log.warn("Poll confirm failed", { reference, error: (e as Error).message });
                    return null;
                });
                if (confirmed) payment = confirmed;
            }
            return res.json({ status: payment.status, providerStatus: payment.providerStatus || null });
        } catch (error) {
            log.error("Error fetching payment status", { error: (error as Error).message });
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
