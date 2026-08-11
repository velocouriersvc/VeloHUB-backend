import { Response } from "express";
import { AuthRequest } from "../middleware/role-middleware";
import { ReferralService } from "../services/referral-service";
import { createServiceLogger } from "../utils/logger";

const log = createServiceLogger("ReferralController");

export class ReferralController {
    private referralService = new ReferralService();

    /**
     * GET /referrals/me
     * The signed-in user's referral code, reward amounts (local currency), and progress.
     */
    getMyReferral = async (req: AuthRequest, res: Response) => {
        try {
            const userId = req.user?.id;
            if (!userId) return res.status(401).json({ message: "User ID required" });

            // The app passes its Default Currency so amounts display in the user's chosen currency.
            const raw = (req.query.currency as string | undefined) || "";
            const displayCurrency = /^[A-Za-z]{3}$/.test(raw.trim()) ? raw.trim().toUpperCase() : undefined;

            const data = await this.referralService.getOrCreateCode(userId, displayCurrency);
            return res.json(data);
        } catch (error) {
            log.error("Error getting referral", { error: (error as Error).message });
            return res.status(500).json({ message: "Internal server error" });
        }
    };
}
