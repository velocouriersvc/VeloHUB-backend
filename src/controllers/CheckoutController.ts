import { Response } from "express";
import { AuthRequest } from "../middleware/role-middleware";
import { CheckoutService } from "../services/checkout-service";
import { createServiceLogger } from "../utils/logger";
import { mapErrorToResponse } from "../utils/app-error";

const log = createServiceLogger("CheckoutController");

export class CheckoutController {
    private checkoutService = new CheckoutService();

    checkout = async (req: AuthRequest, res: Response) => {
        try {
            const userId = req.user?.id;
            if (!userId) return res.status(401).json({ message: "User ID required" });

            const { kind } = req.body || {};
            if (!kind || (kind !== "product_order" && kind !== "product_order_with_delivery" && kind !== "package_ride")) {
                return res.status(400).json({
                    message: "kind is required and must be one of: product_order, product_order_with_delivery, package_ride",
                });
            }

            const result = await this.checkoutService.checkout(userId, req.body);
            return res.status(201).json({ message: "Checkout created", ...result });
        } catch (error) {
            const { status, body } = mapErrorToResponse(error);
            // Only log true server faults at error level; business 4xx are expected.
            if (status >= 500) {
                log.error("Unified checkout failed", { error: (error as Error).message });
            } else {
                log.warn("Checkout rejected", { status, code: body.code, message: body.message });
            }
            return res.status(status).json(body);
        }
    };
}

