
import { Request, Response } from "express";
import { AppDataSource } from "../db/data-source";
import { User } from "../models/user";
import { BuyerProfile } from "../models/buyer-profile";
import { DriverProfile } from "../models/driver-profile";
import { MerchantProfile } from "../models/merchant-profile";
import { Role } from "../models/role";
import { Otp } from "../models/otp";
import { Identification } from "../models/identification";
import { createServiceLogger } from "../utils/logger";

const log = createServiceLogger("DevController");

export class DevController {
    getAllData = async (req: Request, res: Response) => {
        try {
            const users = await AppDataSource.getRepository(User).find({
                relations: ["userRoles", "userRoles.role"]
            });
            const buyerProfiles = await AppDataSource.getRepository(BuyerProfile).find();
            const driverProfiles = await AppDataSource.getRepository(DriverProfile).find();
            const merchantProfiles = await AppDataSource.getRepository(MerchantProfile).find();
            const roles = await AppDataSource.getRepository(Role).find();
            const otps = await AppDataSource.getRepository(Otp).find({
                order: { createdAt: "DESC" },
                take: 50 // Limit to last 50 OTPs
            });
            const identifications = await AppDataSource.getRepository(Identification).find();

            return res.status(200).json({
                users,
                buyerProfiles,
                driverProfiles,
                merchantProfiles,
                roles,
                otps,
                identifications
            });
        } catch (error) {
            log.error("Error fetching dev data", { error: (error as Error).message });
            return res.status(500).json({ message: "Internal server error" });
        }
    };
}
