import { Request, Response } from "express";
import { AppDataSource } from "../db/data-source";
import { DriverProfile } from "../models/driver-profile";
import { MerchantProfile, MerchantVerificationStatus } from "../models/merchant-profile";
import { Ride } from "../models/ride";
import { User, UserStatus } from "../models/user";
import { Zone } from "../models/zone";
import { PlatformSettings } from "../models/platform-settings";
import { PlatformWithdrawal } from "../models/platform-withdrawal";
import { UserRole, RoleStatus } from "../models/user-role";
import { Role, RoleType } from "../models/role";

export class AdminController {
    private userRepo = AppDataSource.getRepository(User);
    private driverRepo = AppDataSource.getRepository(DriverProfile);
    private merchantRepo = AppDataSource.getRepository(MerchantProfile);
    private rideRepo = AppDataSource.getRepository(Ride);
    private zoneRepo = AppDataSource.getRepository(Zone);
    private settingsRepo = AppDataSource.getRepository(PlatformSettings);
    private withdrawalRepo = AppDataSource.getRepository(PlatformWithdrawal);
    private userRoleRepo = AppDataSource.getRepository(UserRole);
    private roleRepo = AppDataSource.getRepository(Role);

    private applyLocationFilter = (req: Request, where: any = {}) => {
        const user = (req as any).user;
        if (!user) return where;

        const isSuperAdmin = user.roles.some((r: any) => r.name === "super_admin" || r.name === "admin");
        
        // Super Admin can override scope with a header
        const scopeCountry = req.headers['x-country-scope'] as string;
        const scopeCity = req.headers['x-city-scope'] as string;

        if (isSuperAdmin) {
            if (scopeCountry) where.country = scopeCountry;
            if (scopeCity) where.city = scopeCity;
            return where;
        }

        // For other roles, find the most permissive role's scope
        // Simplified: take the first role that has allowedCountries set
        const role = user.roles.find((r: any) => r.allowedCountries && r.allowedCountries.length > 0);
        
        if (role) {
            // If the admin is requesting a specific scope, check if they are allowed
            if (scopeCountry) {
                if (role.allowedCountries.includes(scopeCountry)) {
                    where.country = scopeCountry;
                } else {
                    // Not allowed, filter by all their allowed countries
                    where.country = { $in: role.allowedCountries };
                }
            } else {
                // No specific scope requested, filter by all allowed countries
                // TypeORM's In operator for where clause
                const { In } = require("typeorm");
                where.country = In(role.allowedCountries);
            }

            if (scopeCity && role.allowedCities && role.allowedCities.includes(scopeCity)) {
                where.city = scopeCity;
            } else if (role.allowedCities && role.allowedCities.length > 0) {
                const { In } = require("typeorm");
                where.city = In(role.allowedCities);
            }
        }

        return where;
    };

    /**
     * GET /admin/drivers
     */
    getDrivers = async (req: Request, res: Response) => {
        try {
            const where = this.applyLocationFilter(req);
            const drivers = await this.driverRepo.find({
                where,
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
                country: d.country,
                city: d.city,
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
            const where = this.applyLocationFilter(req);
            const merchants = await this.merchantRepo.find({
                where,
                relations: ["user"]
            });
            return res.json(merchants.map(m => ({
                id: m.userId,
                business_name: m.businessName,
                owner_name: m.user.email,
                email: m.businessEmail || m.user.email,
                phone: m.businessPhone || m.user.phoneNumber,
                category: m.category,
                status: m.status,
                country: m.country,
                city: m.city,
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
            const where = this.applyLocationFilter(req);
            const rides = await this.rideRepo.find({
                where,
                order: { createdAt: "DESC" },
                take: 100,
                relations: ["customer", "driver"]
            });
            return res.json(rides.map(r => ({
                ...r,
                rider_name: r.customer?.email,
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
            const where = this.applyLocationFilter(req);
            const users = await this.userRepo.find({ 
                where,
                relations: ["userRoles", "userRoles.role"]
            });
            return res.json(users.map(u => ({
                id: u.id,
                full_name: u.fullName || u.email,
                email: u.email,
                phone: u.phoneNumber,
                status: u.status,
                country: u.country,
                city: u.city,
                roles: u.userRoles?.map((ur: any) => ({
                    name: ur.role?.name,
                    allowedCountries: ur.allowedCountries,
                    allowedCities: ur.allowedCities
                })),
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
            if (!merchant) return res.status(404).json({ message: "Merchant find by userId failed" });

            merchant.status = status as MerchantVerificationStatus;
            await this.merchantRepo.save(merchant);

            return res.json({ message: "Merchant status updated", status: merchant.status });
        } catch (error) {
            console.error("Error updating merchant status:", error);
            return res.status(500).json({ message: "Internal server error" });
        }
    };

    /**
     * Zones
     */
    getZones = async (req: Request, res: Response) => {
        try {
            const where = this.applyLocationFilter(req);
            const zones = await this.zoneRepo.find({ where, order: { createdAt: "DESC" } });
            return res.json(zones);
        } catch (error) {
            return res.status(500).json({ message: "Error fetching zones" });
        }
    };

    createZone = async (req: Request, res: Response) => {
        try {
            const zone = this.zoneRepo.create(req.body);
            await this.zoneRepo.save(zone);
            return res.status(201).json(zone);
        } catch (error) {
            return res.status(500).json({ message: "Error creating zone" });
        }
    };

    updateZone = async (req: Request, res: Response) => {
        try {
            await this.zoneRepo.update(req.params.id, req.body);
            const updated = await this.zoneRepo.findOneBy({ id: req.params.id });
            return res.json(updated);
        } catch (error) {
            return res.status(500).json({ message: "Error updating zone" });
        }
    };

    deleteZone = async (req: Request, res: Response) => {
        try {
            await this.zoneRepo.delete(req.params.id);
            return res.status(204).send();
        } catch (error) {
            return res.status(500).json({ message: "Error deleting zone" });
        }
    };

    /**
     * Settings
     */
    getSettings = async (req: Request, res: Response) => {
        try {
            const settings = await this.settingsRepo.find();
            return res.json(settings);
        } catch (error) {
            return res.status(500).json({ message: "Error fetching settings" });
        }
    };

    updateSetting = async (req: Request, res: Response) => {
        try {
            const { setting_key, setting_value } = req.body;
            let setting = await this.settingsRepo.findOneBy({ setting_key });
            if (setting) {
                setting.setting_value = setting_value;
            } else {
                setting = this.settingsRepo.create({ setting_key, setting_value });
            }
            await this.settingsRepo.save(setting);
            return res.json(setting);
        } catch (error) {
            return res.status(500).json({ message: "Error updating setting" });
        }
    };

    /**
     * Withdrawals
     */
    getWithdrawals = async (req: Request, res: Response) => {
        try {
            const where = this.applyLocationFilter(req);
            const withdrawals = await this.withdrawalRepo.find({ where, order: { createdAt: "DESC" } });
            return res.json(withdrawals);
        } catch (error) {
            return res.status(500).json({ message: "Error fetching withdrawals" });
        }
    };

    createWithdrawal = async (req: Request, res: Response) => {
        try {
            const withdrawal = this.withdrawalRepo.create(req.body);
            await this.withdrawalRepo.save(withdrawal);
            return res.status(201).json(withdrawal);
        } catch (error) {
            return res.status(500).json({ message: "Error creating withdrawal" });
        }
    };

    updateWithdrawal = async (req: Request, res: Response) => {
        try {
            await this.withdrawalRepo.update(req.params.id, req.body);
            const updated = await this.withdrawalRepo.findOneBy({ id: req.params.id });
            return res.json(updated);
        } catch (error) {
            return res.status(500).json({ message: "Error updating withdrawal" });
        }
    };

    /**
     * Staff Management
     */
    getStaff = async (req: Request, res: Response) => {
        try {
            // Find all users who have at least one role
            const users = await this.userRepo.createQueryBuilder("user")
                .leftJoinAndSelect("user.userRoles", "userRole")
                .leftJoinAndSelect("userRole.role", "role")
                .where("userRole.id IS NOT NULL")
                .getMany();

            return res.json(users.map(u => ({
                id: u.id,
                full_name: u.fullName || (u.email?.split('@')[0]) || 'Admin',
                email: u.email,
                phone: u.phoneNumber,
                status: u.status,
                roles: u.userRoles?.map((ur: any) => ({
                    name: ur.role?.name,
                    allowedCountries: ur.allowedCountries,
                    allowedCities: ur.allowedCities
                })),
                last_active: u.lastLoginAt,
                created_date: u.createdAt,
            })));
        } catch (error) {
            console.error("Error fetching staff:", error);
            return res.status(500).json({ message: "Internal server error" });
        }
    };

    updateStaffRole = async (req: Request, res: Response) => {
        try {
            const { email, phoneNumber, role: roleName, allowedCountries, allowedCities } = req.body;
            
            if (!email && !phoneNumber) {
                return res.status(400).json({ message: "Email or phone number required" });
            }

            // 1. Find or create user
            let user = await this.userRepo.findOne({
                where: email ? { email } : { phoneNumber }
            });

            if (!user) {
                user = this.userRepo.create({
                    id: require("crypto").randomUUID(),
                    email,
                    phoneNumber,
                    status: UserStatus.ACTIVE
                });
                await this.userRepo.save(user);
            }

            // 2. Find the role
            const role = await this.roleRepo.findOneBy({ name: roleName as RoleType });
            if (!role) {
                return res.status(404).json({ message: `Role ${roleName} not found` });
            }

            // 3. Update or create UserRole
            let userRole = await this.userRoleRepo.findOne({
                where: { userId: user.id, roleId: role.id }
            });

            if (userRole) {
                userRole.allowedCountries = allowedCountries;
                userRole.allowedCities = allowedCities;
                userRole.status = RoleStatus.APPROVED;
            } else {
                // If it's a new assignment, we might want to deactivate other admin roles 
                // but for now let's just add it
                userRole = this.userRoleRepo.create({
                    userId: user.id,
                    roleId: role.id,
                    allowedCountries,
                    allowedCities,
                    status: RoleStatus.APPROVED,
                    completedRequirements: true
                });
            }

            await this.userRoleRepo.save(userRole);

            return res.json({ message: "Staff role updated successfully", userId: user.id });
        } catch (error) {
            console.error("Error updating staff role:", error);
            return res.status(500).json({ message: "Internal server error" });
        }
    };
}

