import { Request, Response } from "express";
import { ProfileService } from "../services/profile-service.js";

export class ProfileController {
    private profileService = new ProfileService();

    createBuyerProfile = async (req: Request, res: Response) => {
        try {
            if (!req.body.userId || !req.body.fullName) {
                return res.status(400).json({ message: "userId and fullName are required" });
            }

            const profile = await this.profileService.saveBuyerProfile(req.body);
            return res.status(200).json(profile);
        } catch (error) {
            console.error("Error saving buyer profile:", error);
            return res.status(500).json({ message: "Internal server error" });
        }
    };

    createDriverProfile = async (req: Request, res: Response) => {
        try {
            if (!req.body.userId || !req.body.fullName || !req.body.licenseNumber) {
                return res.status(400).json({ message: "userId, fullName, and licenseNumber are required" });
            }

            const profile = await this.profileService.saveDriverProfile(req.body);
            return res.status(200).json(profile);
        } catch (error) {
            console.error("Error saving driver profile:", error);
            return res.status(500).json({ message: "Internal server error" });
        }
    };

    createMerchantProfile = async (req: Request, res: Response) => {
        try {
            if (!req.body.userId || !req.body.businessName) {
                return res.status(400).json({ message: "userId and businessName are required" });
            }

            const profile = await this.profileService.saveMerchantProfile(req.body);
            return res.status(200).json(profile);
        } catch (error) {
            console.error("Error saving merchant profile:", error);
            return res.status(500).json({ message: "Internal server error" });
        }
    };
}
