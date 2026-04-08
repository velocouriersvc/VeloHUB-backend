import { Response } from "express";
import { AuthRequest } from "../middleware/role-middleware";
import { CheckoutService } from "../services/checkout-service";
import { createServiceLogger } from "../utils/logger";

const log = createServiceLogger("CheckoutController");

export class CheckoutController {
    private checkoutService = new CheckoutService();

    checkout = async (req: AuthRequest, res: Response) => {
        try {
            const userId = req.user?.id;
            if (!userId) return res.status(401).json({ message: "User ID required" });

            const { kind } = req.body || {};
            if (!kind || (kind !== "product_order" && kind !== "package_ride")) {
                return res.status(400).json({
                    message: "kind is required and must be one of: product_order, package_ride",
                });
            }

            const result = await this.checkoutService.checkout(userId, req.body);
            return res.status(201).json({ message: "Checkout created", ...result });
        } catch (error) {
            const message = (error as Error).message;
            log.error("Unified checkout failed", { error: message });

            if (
                message.includes("empty") ||
                message.includes("required") ||
                message.includes("Out of stock") ||
                message.includes("Payment failed")
            ) {
                return res.status(400).json({ message });
            }

            return res.status(500).json({ message: "Internal server error" });
        }
    };
}

