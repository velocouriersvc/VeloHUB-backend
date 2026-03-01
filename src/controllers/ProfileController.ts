import { Request, Response } from "express";
import { ProfileService } from "../services/profile-service";
import { BuyerSetupPayload, DriverSetupPayload, MerchantSetupPayload } from "../types/profile";
import { AuthRequest } from "../middleware/role-middleware";

export class ProfileController {
    private profileService = new ProfileService();

    setupBuyer = async (req: AuthRequest, res: Response) => {
        try {
            // User verified by requireRole middleware
            const userId = (req as any).user?.id;
            if (!userId) return res.status(401).json({ message: "User ID required" });

            const payload: BuyerSetupPayload = req.body;
            const profile = await this.profileService.setupBuyerProfile(userId, payload);
            return res.status(200).json(profile);
        } catch (error) {
            console.error("Error setting up buyer profile:", error);
            return res.status(500).json({ message: "Internal server error" });
        }
    };

    setupDriver = async (req: AuthRequest, res: Response) => {
        try {
            // User verified by requireRole middleware
            const userId = (req as any).user?.id;
            if (!userId) return res.status(401).json({ message: "User ID required" });

            const payload: DriverSetupPayload = req.body;
            const profile = await this.profileService.setupDriverProfile(userId, payload);
            return res.status(200).json(profile);
        } catch (error) {
            console.error("Error setting up driver profile:", error);
            return res.status(500).json({ message: "Internal server error" });
        }
    };

    setupMerchant = async (req: AuthRequest, res: Response) => {
        try {
            // User verified by requireRole middleware
            const userId = (req as any).user?.id;
            if (!userId) return res.status(401).json({ message: "User ID required" });

            const payload: MerchantSetupPayload = req.body;
            const profile = await this.profileService.setupMerchantProfile(userId, payload);
            return res.status(200).json(profile);
        } catch (error) {
            console.error("Error setting up merchant profile:", error);
            return res.status(500).json({ message: "Internal server error" });
        }
    };
}
