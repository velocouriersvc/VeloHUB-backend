import { Request, Response } from "express";
import { SubscriptionService } from "../services/subscription-service";
import { PaymentMethodType } from "../models/payment";
import { createServiceLogger } from "../utils/logger";

const log = createServiceLogger("SubscriptionController");

export class SubscriptionController {
    private subscriptionService = new SubscriptionService();

    async checkAccess(req: Request, res: Response) {
        try {
            const userId = (req as any).user?.id;
            if (!userId) return res.status(401).json({ message: "Unauthorized" });

            const hasAccess = await this.subscriptionService.checkAccess(userId);
            return res.json({ hasAccess });
        } catch (error) {
            return res.status(400).json({ message: (error as Error).message });
        }
    }

    async initiateSubscription(req: Request, res: Response) {
        try {
            const userId = (req as any).user?.id;
            const { paymentMethod, phoneNumber } = req.body;

            if (!userId) return res.status(401).json({ message: "Unauthorized" });

            const result = await this.subscriptionService.initiateSubscription(
                userId,
                paymentMethod as PaymentMethodType,
                phoneNumber
            );

            return res.status(201).json(result);
        } catch (error) {
            log.error("Error initiating subscription", { error: (error as Error).message });
            return res.status(400).json({ message: (error as Error).message });
        }
    }

    async getStatus(req: Request, res: Response) {
        try {
            const userId = (req as any).user?.id;
            if (!userId) return res.status(401).json({ message: "Unauthorized" });

            const status = await this.subscriptionService.getSubscriptionStatus(userId);
            return res.json(status);
        } catch (error) {
            return res.status(400).json({ message: (error as Error).message });
        }
    }
}
