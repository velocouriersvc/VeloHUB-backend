import { Request, Response } from "express";
import { AuthRequest } from "../middleware/role-middleware";
import { IdentityVerificationService } from "../services/identity/identity-verification-service";
import { AppDataSource } from "../db/data-source";
import { User } from "../models/user";
import { Identification } from "../models/identification";
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
     * Get current identity status for the logged in user (any role).
     */
    getStatus = async (req: AuthRequest, res: Response) => {
        try {
            const userId = (req as any).user?.id;
            if (!userId) return res.status(401).json({ message: "UserId required" });

            const user = await AppDataSource.getRepository(User).findOne({
                where: { id: userId },
                relations: ["driverProfile", "merchantProfile", "buyerProfile"],
            });
            const identificationId = user?.driverProfile?.identificationId
                || user?.merchantProfile?.identificationId
                || user?.buyerProfile?.identificationId;
            if (!identificationId) return res.json({ status: "unverified" });

            const identification = await AppDataSource.getRepository(Identification).findOne({
                where: { id: identificationId },
            });
            return res.json({
                status: identification?.status ?? "unverified",
                updatedAt: identification?.updatedAt ?? null,
            });
        } catch (error) {
            log.error("Error getting identity status", { error: (error as Error).message });
            return res.status(500).json({ message: "Internal server error" });
        }
    };
}
