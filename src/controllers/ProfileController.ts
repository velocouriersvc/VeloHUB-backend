import { Request, Response } from "express";
import { ProfileService } from "../services/profile-service";
import { ReportService } from "../services/report-service";
import { BuyerSetupPayload, DriverSetupPayload, MerchantSetupPayload } from "../types/profile";
import { AuthRequest } from "../middleware/role-middleware";
import { createServiceLogger } from "../utils/logger";

const log = createServiceLogger("ProfileController");

export class ProfileController {
    private profileService = new ProfileService();
    private reportService = new ReportService();

    getMyProfile = async (req: AuthRequest, res: Response) => {
        try {
            const userId = (req as any).user?.id;
            if (!userId) return res.status(401).json({ message: "User ID required" });

            const profile = await this.profileService.getUserProfile(userId);
            return res.status(200).json(profile);
        } catch (error) {
            log.error("Error fetching user profile", { error: (error as Error).message, stack: (error as Error).stack });
            return res.status(500).json({ message: "Internal server error", details: (error as Error).message });
        }
    };

    updateMyProfile = async (req: AuthRequest, res: Response) => {
        try {
            const userId = (req as any).user?.id;
            if (!userId) return res.status(401).json({ message: "User ID required" });

            const { fullName, email, profileImageUrl } = req.body || {};
            const profile = await this.profileService.updateUserProfile(userId, {
                fullName,
                email,
                profileImageUrl,
            });
            return res.status(200).json(profile);
        } catch (error) {
            log.error("Error updating user profile", { error: (error as Error).message });
            return res.status(500).json({ message: "Internal server error" });
        }
    };

    deleteMyAccount = async (req: AuthRequest, res: Response) => {
        try {
            const userId = (req as any).user?.id;
            if (!userId) return res.status(401).json({ message: "User ID required" });

            await this.profileService.deleteMyAccount(userId);
            return res.status(200).json({ message: "Account deleted successfully." });
        } catch (error) {
            log.error("Error deleting user account", { error: (error as Error).message });
            return res.status(500).json({ message: "Internal server error" });
        }
    };

    setupBuyer = async (req: AuthRequest, res: Response) => {
        try {
            // User verified by requireRole middleware
            const userId = (req as any).user?.id;
            if (!userId) return res.status(401).json({ message: "User ID required" });

            const payload: BuyerSetupPayload = req.body;
            const profile = await this.profileService.setupBuyerProfile(userId, payload);
            return res.status(200).json(profile);
        } catch (error) {
            log.error("Error setting up buyer profile", { error: (error as Error).message });
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
            log.error("Error setting up driver profile", { error: (error as Error).message });
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
            log.error("Error setting up merchant profile", { error: (error as Error).message });
            return res.status(500).json({ message: "Internal server error" });
        }
    };

    generateActivityReport = async (req: AuthRequest, res: Response) => {
        try {
            const userId = (req as any).user?.id;
            if (!userId) return res.status(401).json({ message: "User ID required" });

            const result = await this.reportService.sendActivityReport(userId);
            if (result.success) {
                return res.status(200).json({ message: result.message });
            } else {
                return res.status(400).json({ message: result.message });
            }
        } catch (error) {
            log.error("Error triggering activity report", { error: (error as Error).message });
            return res.status(500).json({ message: "Internal server error" });
        }
    };
}
