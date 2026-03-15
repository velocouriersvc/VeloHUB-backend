
import { Request, Response } from "express";
import { AppDataSource } from "../db/data-source";
import { User } from "../models/user";
import { BuyerProfile } from "../models/buyer-profile";
import { DriverProfile } from "../models/driver-profile";
import { MerchantProfile } from "../models/merchant-profile";
import { Role } from "../models/role";
import { Otp } from "../models/otp";
import { Identification } from "../models/identification";
import { Ride } from "../models/ride";
import { Zone } from "../models/zone";
import { PlatformWithdrawal } from "../models/platform-withdrawal";
import { PlatformSettings } from "../models/platform-settings";
import { Waitlist } from "../models/waitlist";

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
            const rides = await AppDataSource.getRepository(Ride).find({
                order: { createdAt: "DESC" },
                take: 50
            });
            const zones = await AppDataSource.getRepository(Zone).find();
            const withdrawals = await AppDataSource.getRepository(PlatformWithdrawal).find({
                order: { createdAt: "DESC" }
            });
            const settings = await AppDataSource.getRepository(PlatformSettings).find();
            const waitlist = await AppDataSource.getRepository(Waitlist).find({
                relations: ["country"],
                order: { createdAt: "DESC" }
            });

            return res.status(200).json({
                users,
                buyerProfiles,
                driverProfiles,
                merchantProfiles,
                roles,
                otps,
                identifications,
                rides,
                zones,
                withdrawals,
                settings,
                waitlist
            });
        } catch (error) {
            console.error("Error fetching dev data:", error);
            return res.status(500).json({ message: "Internal server error" });
        }
    };
}
