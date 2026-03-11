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
        } catch (error: any) {
            log.error("Webhook error", { error: error.message });
            // Still return 200 to prevent retries on our errors
            return res.status(200).json({ message: "ok" });
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
        } catch (error: any) {
            log.error("Error verifying payment", { error: error.message });
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
        } catch (error: any) {
            log.error("Error getting payment history", { error: error.message });
            return res.status(500).json({ message: "Internal server error" });
        }
    };
}
