
import { Request, Response } from "express";
import { AppDataSource } from "../db/data-source";
import { User } from "../models/user";
import { BuyerProfile } from "../models/buyer-profile";
import { DriverProfile } from "../models/driver-profile";
import { MerchantProfile } from "../models/merchant-profile";
import { Role, RoleType } from "../models/role";
import { UserRole, RoleStatus } from "../models/user-role";
import { Otp } from "../models/otp";
import { Identification } from "../models/identification";
import { createServiceLogger } from "../utils/logger";
import crypto from "crypto";

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

    createAdmin = async (req: Request, res: Response) => {
        try {
            const { phoneNumber, email, fullName } = req.body;

            if (!phoneNumber) {
                return res.status(400).json({ message: "phoneNumber is required" });
            }

            const userRepo = AppDataSource.getRepository(User);
            const roleRepo = AppDataSource.getRepository(Role);
            const userRoleRepo = AppDataSource.getRepository(UserRole);

            // 1. Find or create user
            let user = await userRepo.findOneBy({ phoneNumber });
            if (!user) {
                user = userRepo.create({
                    id: crypto.randomUUID(),
                    phoneNumber,
                    email: email || null,
                    status: "active" as any, // UserStatus.ACTIVE
                });
                await userRepo.save(user);
                log.info("Created new user for admin setup", { userId: user.id });
            } else if (email) {
                user.email = email;
                await userRepo.save(user);
            }

            // 2. Find admin role
            let adminRole = await roleRepo.findOneBy({ name: RoleType.ADMIN });
            if (!adminRole) {
                // Should exist from migrations, but create if missing for safety in dev
                adminRole = roleRepo.create({
                    name: RoleType.ADMIN,
                    description: "Administrator with full access"
                });
                await roleRepo.save(adminRole);
            }

            // 3. Assign role
            let userRole = await userRoleRepo.findOneBy({
                userId: user.id,
                roleId: adminRole.id
            });

            if (!userRole) {
                userRole = userRoleRepo.create({
                    userId: user.id,
                    roleId: adminRole.id,
                    status: RoleStatus.APPROVED,
                });
                await userRoleRepo.save(userRole);
                log.info("Assigned admin role to user", { userId: user.id });
            } else if (userRole.status !== RoleStatus.APPROVED) {
                userRole.status = RoleStatus.APPROVED;
                await userRoleRepo.save(userRole);
                log.info("Updated admin role status to APPROVED", { userId: user.id });
            }

            return res.status(200).json({
                message: "Admin user created/updated successfully",
                user: {
                    id: user.id,
                    phoneNumber: user.phoneNumber,
                    email: user.email,
                    role: RoleType.ADMIN,
                    status: userRole.status
                }
            });
        } catch (error) {
            log.error("Error creating admin user", { error: (error as Error).message });
            return res.status(500).json({ message: "Internal server error" });
        }
    };
}
