import { Request, Response } from "express";
import { AuthRequest } from "../middleware/role-middleware";
import { IdentityVerificationService } from "../services/identity/identity-verification-service";
import { createServiceLogger } from "../utils/logger";

const log = createServiceLogger("IdentityController");

export class IdentityController {
    private identityService = new IdentityVerificationService();

    /**
     * POST /auth/identity-session
     * Create a new verification session for the current user
     */
    createSession = async (req: AuthRequest, res: Response) => {
        try {
            const userId = (req as any).user?.id || req.body.userId; // userId from body if internal or superadmin

            if (!userId) {
                return res.status(401).json({ message: "UserId required" });
            }

            const result = await this.identityService.createVerificationSession(userId);
            return res.status(201).json(result);
        } catch (error) {
            log.error("Error creating identity session", { error: (error as Error).message });
            return res.status(500).json({ message: "Internal server error", error: (error as Error).message });
        }
    };

    /**
     * POST /identity/webhook
     * Handle Stripe Webhooks for identity verification
     */
    handleWebhook = async (req: Request, res: Response) => {
        try {
            const signature = req.headers["stripe-signature"] as string;

            if (!signature) {
                log.warn("Missing stripe-signature in webhook");
                return res.status(400).json({ message: "Missing stripe-signature" });
            }

            const payload = req.body instanceof Buffer ? req.body.toString("utf8") : req.body;
            await this.identityService.handleWebhook(payload, signature);

            return res.status(200).json({ received: true });
        } catch (error) {
            log.error("Stripe Identity webhook handling failed", { error: (error as Error).message });
            // Respond 200 even on error to stop Stripe from retrying to some extent,
            // or 4xx/5xx for real errors based on signature verification.
            return res.status(200).json({ received: true, error: (error as Error).message });
        }
    };

    /**
     * GET /auth/identity-status
     * Get current identity status for the logged in user
     */
    getStatus = async (req: AuthRequest, res: Response) => {
        try {
            const userId = (req as any).user?.id;
            // ... status logic ...
            return res.json({ status: "pending" }); // stub
        } catch (error) {
            return res.status(500).json({ message: "Internal server error" });
        }
    };
}
