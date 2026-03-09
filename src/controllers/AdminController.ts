import { Request, Response } from "express";
import { AppDataSource } from "../db/data-source";
import { DriverProfile } from "../models/driver-profile";
import { MerchantProfile, MerchantVerificationStatus } from "../models/merchant-profile";
import { Ride } from "../models/ride";
import { User, UserStatus } from "../models/user";

export class AdminController {
    private userRepo = AppDataSource.getRepository(User);
    private driverRepo = AppDataSource.getRepository(DriverProfile);
    private merchantRepo = AppDataSource.getRepository(MerchantProfile);
    private rideRepo = AppDataSource.getRepository(Ride);

    /**
     * GET /admin/drivers
     */
    getDrivers = async (req: Request, res: Response) => {
        try {
            const drivers = await this.driverRepo.find({
                relations: ["user"]
            });
            return res.json(drivers.map(d => ({
                id: d.userId,
                full_name: d.fullName,
                email: d.user.email,
                phone: d.user.phoneNumber,
                vehicle_type: d.vehicleType,
                vehicle_number: d.plateNumber,
                status: d.user.status,
                created_date: d.user.createdAt,
            })));
        } catch (error) {
            console.error("Error fetching drivers:", error);
            return res.status(500).json({ message: "Internal server error" });
        }
    };

    /**
     * GET /admin/merchants
     */
    getMerchants = async (req: Request, res: Response) => {
        try {
            const merchants = await this.merchantRepo.find({
                relations: ["user"]
            });
            return res.json(merchants.map(m => ({
                id: m.userId,
                business_name: m.businessName,
                owner_name: m.user.email, // Or some other name field if available
                email: m.businessEmail || m.user.email,
                phone: m.businessPhone || m.user.phoneNumber,
                category: m.category,
                status: m.status,
                created_date: m.user.createdAt,
            })));
        } catch (error) {
            console.error("Error fetching merchants:", error);
            return res.status(500).json({ message: "Internal server error" });
        }
    };

    /**
     * GET /admin/rides
     */
    getRides = async (req: Request, res: Response) => {
        try {
            const rides = await this.rideRepo.find({
                order: { createdAt: "DESC" },
                take: 100,
                relations: ["customer", "driver"]
            });
            return res.json(rides.map(r => ({
                ...r,
                rider_name: r.customer?.email, // Simplification
                driver_name: r.driver?.email,
                created_date: r.createdAt,
                order_number: `RIDE-${r.id.split('-')[0].toUpperCase()}`,
            })));
        } catch (error) {
            console.error("Error fetching rides:", error);
            return res.status(500).json({ message: "Internal server error" });
        }
    };

    /**
     * GET /admin/users
     */
    getUsers = async (req: Request, res: Response) => {
        try {
            const users = await this.userRepo.find();
            return res.json(users.map(u => ({
                id: u.id,
                full_name: u.email, // Simplification
                email: u.email,
                phone: u.phoneNumber,
                status: u.status,
                created_date: u.createdAt,
            })));
        } catch (error) {
            console.error("Error fetching users:", error);
            return res.status(500).json({ message: "Internal server error" });
        }
    };

    /**
     * PATCH /admin/drivers/:id
     */
    updateDriverStatus = async (req: Request, res: Response) => {
        try {
            const userId = req.params.id;
            const { status } = req.body;

            const user = await this.userRepo.findOneBy({ id: userId });
            if (!user) return res.status(404).json({ message: "Driver not found" });

            user.status = status as UserStatus;
            await this.userRepo.save(user);

            return res.json({ message: "Driver status updated", status: user.status });
        } catch (error) {
            console.error("Error updating driver status:", error);
            return res.status(500).json({ message: "Internal server error" });
        }
    };

    /**
     * PATCH /admin/merchants/:id
     */
    updateMerchantStatus = async (req: Request, res: Response) => {
        try {
            const userId = req.params.id;
            const { status } = req.body;

            const merchant = await this.merchantRepo.findOneBy({ userId });
            if (!merchant) return res.status(404).json({ message: "Merchant not found" });

            merchant.status = status as MerchantVerificationStatus;
            await this.merchantRepo.save(merchant);

            return res.json({ message: "Merchant status updated", status: merchant.status });
        } catch (error) {
            console.error("Error updating merchant status:", error);
            return res.status(500).json({ message: "Internal server error" });
        }
    };
}

