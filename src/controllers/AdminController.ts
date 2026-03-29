import { Request, Response } from "express";
import { AppDataSource } from "../db/data-source";
import { DriverProfile, DriverVerificationStatus } from "../models/driver-profile";
import { MerchantProfile, MerchantVerificationStatus } from "../models/merchant-profile";
import { Ride } from "../models/ride";
import { User, UserStatus } from "../models/user";
import { OrderStatus, OrderPaymentStatus, DeliveryType } from "../models/order";
import { Zone } from "../models/zone";
import { PlatformSettings } from "../models/platform-settings";
import { PlatformWithdrawal } from "../models/platform-withdrawal";
import { AdminService } from "../services/admin-service";
import { AuthRequest } from "../middleware/role-middleware";
import { createServiceLogger } from "../utils/logger";
import { AuditLogController } from "./AuditLogController";
import { AuditRiskLevel } from "../models/audit-log";
import { SimulateController } from "./SimulateController";
import { Wallet } from "../models/wallet";
import { UserRole, RoleStatus } from "../models/user-role";
import { Role, RoleType } from "../models/role";
import crypto from "crypto";

const log = createServiceLogger("AdminController");

export class AdminController {
    private userRepo = AppDataSource.getRepository(User);
    private driverRepo = AppDataSource.getRepository(DriverProfile);
    private merchantRepo = AppDataSource.getRepository(MerchantProfile);
    private rideRepo = AppDataSource.getRepository(Ride);
    private zoneRepo = AppDataSource.getRepository(Zone);
    private settingsRepo = AppDataSource.getRepository(PlatformSettings);
    private withdrawalRepo = AppDataSource.getRepository(PlatformWithdrawal);
    private walletRepo = AppDataSource.getRepository(Wallet);
    private userRoleRepo = AppDataSource.getRepository(UserRole);
    private roleRepo = AppDataSource.getRepository(Role);
    private adminService = new AdminService();
    public simulateController = new SimulateController();

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
     * POST /admin/drivers
     */
    createDriver = async (req: Request, res: Response) => {
        try {
            const { full_name, email, phone, vehicle_type, vehicle_number, license_number, service_type } = req.body;

            // Check existing
            const checkWhere: any[] = [];
            if (email) checkWhere.push({ email });
            if (phone) checkWhere.push({ phoneNumber: phone });

            let existing = null;
            if (checkWhere.length > 0) {
                existing = await this.userRepo.findOne({ where: checkWhere });
            }
            if (existing) return res.status(400).json({ message: "User with this email or phone already exists" });

            const userId = crypto.randomUUID();

            // 1. Create User
            const user = this.userRepo.create({
                id: userId,
                email,
                phoneNumber: phone,
                status: UserStatus.ACTIVE,
                activeRole: "driver",
                country: "GH"
            });
            await this.userRepo.save(user);

            // 2. Create User Role
            const role = await this.roleRepo.findOneBy({ name: RoleType.DRIVER });
            if (!role) throw new Error("Driver role not found");

            const userRole = this.userRoleRepo.create({
                userId,
                roleId: role.id,
                status: RoleStatus.APPROVED
            });
            await this.userRoleRepo.save(userRole);

            // 3. Create Driver Profile
            const driverProfile = this.driverRepo.create({
                userId,
                fullName: full_name,
                vehicleType: vehicle_type,
                plateNumber: vehicle_number,
                licenseNumber: license_number || "PENDING",
                status: DriverVerificationStatus.APPROVED
            });
            await this.driverRepo.save(driverProfile);

            // 4. Create Wallet
            const wallet = this.walletRepo.create({
                userId,
                balance: 0,
                currency: "GHS"
            });
            await this.walletRepo.save(wallet);

            await AuditLogController.record({
                action: "Create Driver",
                entity_type: "driver",
                entity_id: userId,
                performed_by: (req as any).user?.email || "Admin",
                details: `Created driver ${full_name}`,
                risk_level: AuditRiskLevel.MEDIUM
            });

            return res.status(201).json({ message: "Driver created successfully", id: userId });
        } catch (error) {
            console.error("Error creating driver:", error);
            return res.status(500).json({ message: "Internal server error" });
        }
    };

    /**
     * PATCH /admin/drivers/:id
     */
    updateDriver = async (req: Request, res: Response) => {
        try {
            const userId = req.params.id;
            const { full_name, email, phone, vehicle_type, vehicle_number, license_number, status } = req.body;

            const user = await this.userRepo.findOneBy({ id: userId });
            const driver = await this.driverRepo.findOneBy({ userId });

            if (!user || !driver) return res.status(404).json({ message: "Driver not found" });

            if (email) user.email = email;
            if (phone) user.phoneNumber = phone;
            if (status) user.status = status as UserStatus;
            await this.userRepo.save(user);

            if (full_name) driver.fullName = full_name;
            if (vehicle_type) driver.vehicleType = vehicle_type;
            if (vehicle_number) driver.plateNumber = vehicle_number;
            if (license_number) driver.licenseNumber = license_number;
            await this.driverRepo.save(driver);

            await AuditLogController.record({
                action: "Update Driver",
                entity_type: "driver",
                entity_id: userId,
                performed_by: (req as any).user?.email || "Admin",
                details: `Updated driver details/status`,
                risk_level: AuditRiskLevel.LOW
            });

            return res.json({ message: "Driver updated successfully" });
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

            await AuditLogController.record({
                action: "Update Merchant Status",
                entity_type: "merchant",
                entity_id: userId,
                performed_by: (req as any).user?.email || "Admin",
                details: `Status updated to ${status}`,
                risk_level: AuditRiskLevel.LOW
            });

            return res.json({ message: "Merchant status updated", status: merchant.status });
        } catch (error) {
            console.error("Error updating merchant status:", error);
            return res.status(500).json({ message: "Internal server error" });
        }
    };

    // ════════════════════════════════════════════════════════════════
    //  DASHBOARD
    // ════════════════════════════════════════════════════════════════

    getDashboard = async (req: AuthRequest, res: Response) => {
        try {
            const dashboard = await this.adminService.getDashboard();
            return res.json(dashboard);
        } catch (error) {
            log.error("Error getting dashboard", { error: (error as Error).message });
            return res.status(500).json({ message: "Internal server error" });
        }
    };

    // ════════════════════════════════════════════════════════════════
    //  ORDERS
    // ════════════════════════════════════════════════════════════════

    getOrders = async (req: AuthRequest, res: Response) => {
        try {
            const { status, merchantId, customerId, paymentStatus, deliveryType, from, to, page, limit } = req.query;

            const result = await this.adminService.getOrders({
                status: status as OrderStatus | undefined,
                merchantId: merchantId as string | undefined,
                customerId: customerId as string | undefined,
                paymentStatus: paymentStatus as OrderPaymentStatus | undefined,
                deliveryType: deliveryType as DeliveryType | undefined,
                from: from as string | undefined,
                to: to as string | undefined,
                page: page ? Number(page) : undefined,
                limit: limit ? Number(limit) : undefined,
            });

            return res.json(result);
        } catch (error) {
            log.error("Error getting orders", { error: (error as Error).message });
            return res.status(500).json({ message: "Internal server error" });
        }
    };

    getOrderDetail = async (req: AuthRequest, res: Response) => {
        try {
            const { id } = req.params;
            const order = await this.adminService.getOrderDetail(id);
            return res.json({ order });
        } catch (error) {
            const msg = (error as Error).message;
            if (msg.includes("not found")) return res.status(404).json({ message: msg });
            log.error("Error getting order detail", { error: msg });
            return res.status(500).json({ message: "Internal server error" });
        }
    };

    overrideOrderStatus = async (req: AuthRequest, res: Response) => {
        try {
            const adminId = req.user?.id;
            if (!adminId) return res.status(401).json({ message: "User ID required" });

            const { id } = req.params;
            const { status, note } = req.body;

            if (!status || !Object.values(OrderStatus).includes(status)) {
                return res.status(400).json({
                    message: `status is required. Must be one of: ${Object.values(OrderStatus).join(", ")}`,
                });
            }

            const order = await this.adminService.overrideOrderStatus(id, status, adminId, note);

            await AuditLogController.record({
                action: "Override Order Status",
                entity_type: "order",
                entity_id: id,
                performed_by: req.user?.email || "Admin",
                details: `Order status overridden to ${status}. Note: ${note || 'None'}`,
                risk_level: AuditRiskLevel.MEDIUM
            });

            return res.json({ message: "Order status updated", order: { id: order.id, orderNumber: order.orderNumber, status: order.status } });
        } catch (error) {
            const msg = (error as Error).message;
            if (msg.includes("not found")) return res.status(404).json({ message: msg });
            log.error("Error overriding order status", { error: msg });
            return res.status(500).json({ message: "Internal server error" });
        }
    };

    refundOrder = async (req: AuthRequest, res: Response) => {
        try {
            const adminId = req.user?.id;
            if (!adminId) return res.status(401).json({ message: "User ID required" });

            const { id } = req.params;
            const { reason } = req.body;

            const order = await this.adminService.refundOrder(id, adminId, reason);

            await AuditLogController.record({
                action: "Refund Order",
                entity_type: "order",
                entity_id: id,
                performed_by: req.user?.email || "Admin",
                details: `Order refunded. Reason: ${reason || 'None'}. Amount: ${order.totalAmount}`,
                risk_level: AuditRiskLevel.HIGH
            });

            return res.json({
                message: "Order refunded",
                order: { id: order.id, orderNumber: order.orderNumber, status: order.status, totalAmount: order.totalAmount },
            });
        } catch (error) {
            const msg = (error as Error).message;
            if (msg.includes("not found")) return res.status(404).json({ message: msg });
            if (msg.includes("already been refunded")) return res.status(400).json({ message: msg });
            log.error("Error refunding order", { error: msg });
            return res.status(500).json({ message: "Internal server error" });
        }
    };

    adminCancelOrder = async (req: AuthRequest, res: Response) => {
        try {
            const adminId = req.user?.id;
            if (!adminId) return res.status(401).json({ message: "User ID required" });

            const { id } = req.params;
            const { reason } = req.body;

            const order = await this.adminService.adminCancelOrder(id, adminId, reason);
            return res.json({
                message: "Order cancelled",
                order: { id: order.id, orderNumber: order.orderNumber, status: order.status },
            });
        } catch (error) {
            const msg = (error as Error).message;
            if (msg.includes("not found")) return res.status(404).json({ message: msg });
            if (msg.includes("Cannot cancel")) return res.status(400).json({ message: msg });
            log.error("Error cancelling order", { error: msg });
            return res.status(500).json({ message: "Internal server error" });
        }
    };

    // ════════════════════════════════════════════════════════════════
    //  PRODUCTS
    // ════════════════════════════════════════════════════════════════

    getProducts = async (req: AuthRequest, res: Response) => {
        try {
            const { merchantId, category, isActive, search, page, limit } = req.query;

            const result = await this.adminService.getProducts({
                merchantId: merchantId as string | undefined,
                category: category as string | undefined,
                isActive: isActive !== undefined ? isActive === "true" : undefined,
                search: search as string | undefined,
                page: page ? Number(page) : undefined,
                limit: limit ? Number(limit) : undefined,
            });

            return res.json(result);
        } catch (error) {
            log.error("Error getting products", { error: (error as Error).message });
            return res.status(500).json({ message: "Internal server error" });
        }
    };

    updateProduct = async (req: AuthRequest, res: Response) => {
        try {
            const adminId = req.user?.id;
            if (!adminId) return res.status(401).json({ message: "User ID required" });

            const { id } = req.params;
            const { action, ...updateData } = req.body;

            let product;
            if (action) {
                if (!["suspend", "reactivate"].includes(action)) {
                    return res.status(400).json({ message: 'action must be "suspend" or "reactivate"' });
                }
                product = action === "suspend"
                    ? await this.adminService.suspendProduct(id, adminId)
                    : await this.adminService.reactivateProduct(id, adminId);
            } else if (Object.keys(updateData).length > 0) {
                product = await this.adminService.updateProduct(id, updateData, adminId);
            } else {
                return res.status(400).json({ message: "No update data provided" });
            }

            return res.json({ message: "Product updated", product });
        } catch (error) {
            const msg = (error as Error).message;
            if (msg.includes("not found")) return res.status(404).json({ message: msg });
            log.error("Error updating product", { error: msg });
            return res.status(500).json({ message: "Internal server error" });
        }
    };

    deleteProduct = async (req: AuthRequest, res: Response) => {
        try {
            const adminId = req.user?.id;
            if (!adminId) return res.status(401).json({ message: "User ID required" });

            const result = await this.adminService.deleteProduct(req.params.id, adminId);
            return res.json(result);
        } catch (error) {
            const msg = (error as Error).message;
            if (msg.includes("not found")) return res.status(404).json({ message: msg });
            log.error("Error deleting product", { error: msg });
            return res.status(500).json({ message: "Internal server error" });
        }
    };

    // ════════════════════════════════════════════════════════════════
    //  MERCHANTS
    // ════════════════════════════════════════════════════════════════

    getMerchantDetails = async (req: AuthRequest, res: Response) => {
        try {
            const result = await this.adminService.getMerchantDetails(req.params.id);
            return res.json(result);
        } catch (error) {
            const msg = (error as Error).message;
            if (msg.includes("not found")) return res.status(404).json({ message: msg });
            log.error("Error getting merchant details", { error: msg });
            return res.status(500).json({ message: "Internal server error" });
        }
    };

    updateMerchantRates = async (req: AuthRequest, res: Response) => {
        try {
            const adminId = req.user?.id;
            if (!adminId) return res.status(401).json({ message: "User ID required" });

            const { id } = req.params;
            const { commissionRate, serviceFeeRate, pickupFeeRate } = req.body;

            const profile = await this.adminService.updateMerchantRates(
                id,
                { commissionRate, serviceFeeRate, pickupFeeRate },
                adminId
            );

            return res.json({
                message: "Merchant rates updated",
                rates: {
                    commissionRate: profile.commissionRate,
                    serviceFeeRate: profile.serviceFeeRate,
                    pickupFeeRate: profile.pickupFeeRate,
                },
            });
        } catch (error) {
            const msg = (error as Error).message;
            if (msg.includes("not found")) return res.status(404).json({ message: msg });
            if (msg.includes("must be between")) return res.status(400).json({ message: msg });
            log.error("Error updating merchant rates", { error: msg });
            return res.status(500).json({ message: "Internal server error" });
        }
    };

    suspendMerchant = async (req: AuthRequest, res: Response) => {
        try {
            const adminId = req.user?.id;
            if (!adminId) return res.status(401).json({ message: "User ID required" });

            const { id } = req.params;
            const { reason } = req.body;

            const profile = await this.adminService.suspendMerchant(id, adminId, reason);
            return res.json({ message: "Merchant suspended", status: profile.status });
        } catch (error) {
            const msg = (error as Error).message;
            if (msg.includes("not found")) return res.status(404).json({ message: msg });
            log.error("Error suspending merchant", { error: msg });
            return res.status(500).json({ message: "Internal server error" });
        }
    };

    approveMerchant = async (req: AuthRequest, res: Response) => {
        try {
            const adminId = req.user?.id;
            if (!adminId) return res.status(401).json({ message: "User ID required" });

            const profile = await this.adminService.approveMerchant(req.params.id, adminId);
            return res.json({ message: "Merchant approved", status: profile.status });
        } catch (error) {
            const msg = (error as Error).message;
            if (msg.includes("not found")) return res.status(404).json({ message: msg });
            log.error("Error approving merchant", { error: msg });
            return res.status(500).json({ message: "Internal server error" });
        }
    };

    updateMerchantProfile = async (req: AuthRequest, res: Response) => {
        try {
            const adminId = req.user?.id;
            if (!adminId) return res.status(401).json({ message: "User ID required" });

            const { id } = req.params;
            const profile = await this.adminService.updateMerchantProfile(id, req.body, adminId);

            await AuditLogController.record({
                action: "Update Merchant Profile",
                entity_type: "merchant",
                entity_id: id,
                performed_by: req.user?.email || "Admin",
                details: `Updated merchant profile fields: ${Object.keys(req.body).join(", ")}`,
                risk_level: AuditRiskLevel.MEDIUM
            });

            return res.json({ message: "Merchant profile updated", profile });
        } catch (error) {
            const msg = (error as Error).message;
            if (msg.includes("not found")) return res.status(404).json({ message: msg });
            log.error("Error updating merchant profile", { error: msg });
            return res.status(500).json({ message: "Internal server error" });
        }
    };

    getMerchantOrders = async (req: AuthRequest, res: Response) => {
        try {
            const { id } = req.params;
            const { status, page, limit } = req.query;

            const result = await this.adminService.getMerchantOrders(id, {
                status: status as OrderStatus | undefined,
                page: page ? Number(page) : undefined,
                limit: limit ? Number(limit) : undefined,
            });

            return res.json(result);
        } catch (error) {
            log.error("Error getting merchant orders", { error: (error as Error).message });
            return res.status(500).json({ message: "Internal server error" });
        }
    };

    getMerchantFinances = async (req: AuthRequest, res: Response) => {
        try {
            const result = await this.adminService.getMerchantFinances(req.params.id);
            return res.json(result);
        } catch (error) {
            log.error("Error getting merchant finances", { error: (error as Error).message });
            return res.status(500).json({ message: "Internal server error" });
        }
    };

    // ════════════════════════════════════════════════════════════════
    //  PAYOUTS
    // ════════════════════════════════════════════════════════════════

    getPayouts = async (req: AuthRequest, res: Response) => {
        try {
            const { status, page, limit } = req.query;

            const result = await this.adminService.getPayouts({
                status: status as "pending" | "completed" | "rejected" | undefined,
                page: page ? Number(page) : undefined,
                limit: limit ? Number(limit) : undefined,
            });

            return res.json(result);
        } catch (error) {
            log.error("Error getting payouts", { error: (error as Error).message });
            return res.status(500).json({ message: "Internal server error" });
        }
    };

    approvePayout = async (req: AuthRequest, res: Response) => {
        try {
            const adminId = req.user?.id;
            if (!adminId) return res.status(401).json({ message: "User ID required" });

            const tx = await this.adminService.approvePayout(req.params.id, adminId);
            return res.json({ message: "Payout approved", reference: tx.reference, amount: Number(tx.amount) });
        } catch (error) {
            const msg = (error as Error).message;
            if (msg.includes("not found")) return res.status(404).json({ message: msg });
            if (msg.includes("already")) return res.status(400).json({ message: msg });
            log.error("Error approving payout", { error: msg });
            return res.status(500).json({ message: "Internal server error" });
        }
    };

    rejectPayout = async (req: AuthRequest, res: Response) => {
        try {
            const adminId = req.user?.id;
            if (!adminId) return res.status(401).json({ message: "User ID required" });

            const { reason } = req.body;
            const tx = await this.adminService.rejectPayout(req.params.id, adminId, reason);
            return res.json({ message: "Payout rejected and refunded", reference: tx.reference, amount: Number(tx.amount) });
        } catch (error) {
            const msg = (error as Error).message;
            if (msg.includes("not found")) return res.status(404).json({ message: msg });
            if (msg.includes("already") || msg.includes("Cannot reject")) return res.status(400).json({ message: msg });
            log.error("Error rejecting payout", { error: msg });
            return res.status(500).json({ message: "Internal server error" });
        }
    };

    // ════════════════════════════════════════════════════════════════
    //  PLATFORM SETTINGS
    // ════════════════════════════════════════════════════════════════

    getSettings = async (req: AuthRequest, res: Response) => {
        try {
            const settings = await this.adminService.getSettings();
            return res.json(settings);
        } catch (error) {
            log.error("Error getting settings", { error: (error as Error).message });
            return res.status(500).json({ message: "Internal server error" });
        }
    };

    updateSettings = async (req: AuthRequest, res: Response) => {
        try {
            const adminId = req.user?.id;
            if (!adminId) return res.status(401).json({ message: "User ID required" });

            const { country } = req.params;
            const settings = await this.adminService.updateSettings(country, req.body, adminId);
            return res.json({ message: "Settings updated", settings });
        } catch (error) {
            log.error("Error updating settings", { error: (error as Error).message });
            return res.status(500).json({ message: "Internal server error" });
        }
    };

    // ════════════════════════════════════════════════════════════════
    //  REPORTS
    // ════════════════════════════════════════════════════════════════

    getRevenueReport = async (req: AuthRequest, res: Response) => {
        try {
            const { from, to } = req.query;
            if (!from || !to) {
                return res.status(400).json({ message: "from and to query params are required (ISO date)" });
            }

            const report = await this.adminService.getRevenueReport(from as string, to as string);
            return res.json({ report });
        } catch (error) {
            log.error("Error getting revenue report", { error: (error as Error).message });
            return res.status(500).json({ message: "Internal server error" });
        }
    };

    getWallets = async (req: AuthRequest, res: Response) => {
        try {
            const { page, limit } = req.query;
            const result = await this.adminService.getWallets(
                limit ? Number(limit) : 100,
                page ? (Number(page) - 1) * Number(limit) : 0
            );
            return res.json(result);
        } catch (error) {
            log.error("Error getting wallets", { error: (error as Error).message });
            return res.status(500).json({ message: "Internal server error" });
        }
    };

    getWalletTransactions = async (req: AuthRequest, res: Response) => {
        try {
            const { id } = req.params;
            const { page, limit } = req.query;
            const result = await this.adminService.getWalletTransactions(
                id,
                limit ? Number(limit) : 50,
                page ? (Number(page) - 1) * Number(limit) : 0
            );
            return res.json(result);
        } catch (error) {
            log.error("Error getting wallet transactions", { error: (error as Error).message });
            return res.status(500).json({ message: "Internal server error" });
        }
    };

    getAllTransactions = async (req: AuthRequest, res: Response) => {
        try {
            const { page, limit } = req.query;
            const result = await this.adminService.getAllTransactions(
                limit ? Number(limit) : 50,
                page ? (Number(page) - 1) * Number(limit) : 0
            );
            return res.json(result);
        } catch (error) {
            log.error("Error getting all transactions", { error: (error as Error).message });
            return res.status(500).json({ message: "Internal server error" });
        }
    };

    getOrderReport = async (req: AuthRequest, res: Response) => {
        try {
            const { from, to } = req.query;
            if (!from || !to) {
                return res.status(400).json({ message: "from and to query params are required (ISO date)" });
            }

            const report = await this.adminService.getOrderReport(from as string, to as string);
            return res.json({ report });
        } catch (error) {
            log.error("Error getting order report", { error: (error as Error).message });
            return res.status(500).json({ message: "Internal server error" });
        }
    };

    // ════════════════════════════════════════════════════════════════
    //  SUPPORT ACTIONS
    // ════════════════════════════════════════════════════════════════

    assignDriver = async (req: AuthRequest, res: Response) => {
        try {
            const adminId = req.user?.id;
            if (!adminId) return res.status(401).json({ message: "User ID required" });

            const { id } = req.params;
            const { driverId } = req.body;

            if (!driverId) return res.status(400).json({ message: "driverId is required" });

            const order = await this.adminService.assignDriverToOrder(id, driverId, adminId);
            return res.json({
                message: "Driver assigned",
                order: { id: order.id, orderNumber: order.orderNumber, status: order.status, driverId: order.driverId },
            });
        } catch (error) {
            const msg = (error as Error).message;
            if (msg.includes("not found")) return res.status(404).json({ message: msg });
            if (msg.includes("only assign")) return res.status(400).json({ message: msg });
            log.error("Error assigning driver", { error: msg });
            return res.status(500).json({ message: "Internal server error" });
        }
    };

    reassignDriver = async (req: AuthRequest, res: Response) => {
        try {
            const adminId = req.user?.id;
            if (!adminId) return res.status(401).json({ message: "User ID required" });

            const { id } = req.params;
            const { driverId } = req.body;

            if (!driverId) return res.status(400).json({ message: "driverId is required" });

            const order = await this.adminService.reassignDriverToOrder(id, driverId, adminId);
            return res.json({
                message: "Driver reassigned",
                order: { id: order.id, orderNumber: order.orderNumber, status: order.status, driverId: order.driverId },
            });
        } catch (error) {
            const msg = (error as Error).message;
            if (msg.includes("not found")) return res.status(404).json({ message: msg });
            if (msg.includes("only reassign")) return res.status(400).json({ message: msg });
            log.error("Error reassigning driver", { error: msg });
            return res.status(500).json({ message: "Internal server error" });
        }
    };

    creditWallet = async (req: AuthRequest, res: Response) => {
        try {
            const adminId = req.user?.id;
            if (!adminId) return res.status(401).json({ message: "User ID required" });

            const { id } = req.params;
            const { amount, reason } = req.body;

            if (!amount || amount <= 0) return res.status(400).json({ message: "amount must be positive" });
            if (!reason) return res.status(400).json({ message: "reason is required" });

            const tx = await this.adminService.creditUserWallet(id, Number(amount), reason, adminId);
            
            await AuditLogController.record({
                action: "Credit Wallet",
                entity_type: "user",
                entity_id: id,
                performed_by: req.user?.email || "Admin",
                details: `Credited ${amount} to wallet. Reason: ${reason}`,
                risk_level: AuditRiskLevel.MEDIUM
            });

            return res.json({
                message: "Wallet credited",
                transaction: { reference: tx.reference, amount: Number(tx.amount), balanceAfter: Number(tx.balanceAfter) },
            });
        } catch (error) {
            const msg = (error as Error).message;
            if (msg.includes("not found")) return res.status(404).json({ message: msg });
            log.error("Error crediting wallet", { error: msg });
            return res.status(500).json({ message: "Internal server error" });
        }
    };

    debitWallet = async (req: AuthRequest, res: Response) => {
        try {
            const adminId = req.user?.id;
            if (!adminId) return res.status(401).json({ message: "User ID required" });

            const { id } = req.params;
            const { amount, reason } = req.body;

            if (!amount || amount <= 0) return res.status(400).json({ message: "amount must be positive" });
            if (!reason) return res.status(400).json({ message: "reason is required" });

            const tx = await this.adminService.debitUserWallet(id, Number(amount), reason, adminId);

            await AuditLogController.record({
                action: "Debit Wallet",
                entity_type: "user",
                entity_id: id,
                performed_by: req.user?.email || "Admin",
                details: `Debited ${amount} from wallet. Reason: ${reason}`,
                risk_level: AuditRiskLevel.MEDIUM
            });

            return res.json({
                message: "Wallet debited",
                transaction: { reference: tx.reference, amount: Number(tx.amount), balanceAfter: Number(tx.balanceAfter) },
            });
        } catch (error) {
            const msg = (error as Error).message;
            if (msg.includes("not found")) return res.status(404).json({ message: msg });
            if (msg.includes("Insufficient")) return res.status(400).json({ message: msg });
            log.error("Error debiting wallet", { error: msg });
            return res.status(500).json({ message: "Internal server error" });
        }
    };

    /* ── Location scope helper ── */

    private applyLocationFilter = (req: Request, where: any = {}) => {
        const user = (req as any).user;
        if (!user) return where;

        const isSuperAdmin = user.roles?.some?.((r: any) =>
            (typeof r === "string" ? r : r.name) === "super_admin" ||
            (typeof r === "string" ? r : r.name) === "admin"
        );

        const scopeCountry = req.headers['x-country-scope'] as string;
        const scopeCity = req.headers['x-city-scope'] as string;

        if (isSuperAdmin) {
            if (scopeCountry) where.country = scopeCountry;
            if (scopeCity) where.city = scopeCity;
            return where;
        }

        // Non-super-admin: restrict to their allowed scope
        const firstRole = Array.isArray(user.roles) ? user.roles[0] : null;
        if (firstRole?.allowedCountries?.length) where.country = firstRole.allowedCountries[0];
        if (firstRole?.allowedCities?.length) where.city = firstRole.allowedCities[0];
        return where;
    };

    /* ── Zones ── */

    getZones = async (req: Request, res: Response) => {
        try {
            const where = this.applyLocationFilter(req);
            const zones = await this.zoneRepo.find({ where, order: { createdAt: "DESC" } });
            return res.json(zones);
        } catch (error) {
            log.error("Error fetching zones", { error: (error as Error).message });
            return res.status(500).json({ message: "Error fetching zones" });
        }
    };

    createZone = async (req: Request, res: Response) => {
        try {
            const zone = (await this.zoneRepo.save(this.zoneRepo.create(req.body))) as any;

            await AuditLogController.record({
                action: "Create Zone",
                entity_type: "zone",
                entity_id: Array.isArray(zone) ? zone[0]?.id : zone.id,
                performed_by: (req as any).user?.email || "Admin",
                details: `Created zone: ${Array.isArray(zone) ? zone[0]?.name : zone.name}`,
                risk_level: AuditRiskLevel.LOW
            });

            return res.status(201).json(zone);
        } catch (error) {
            log.error("Error creating zone", { error: (error as Error).message });
            return res.status(500).json({ message: "Error creating zone" });
        }
    };

    updateZone = async (req: Request, res: Response) => {
        try {
            await this.zoneRepo.update(req.params.id, req.body);
            const updated = await this.zoneRepo.findOneBy({ id: req.params.id });
            return res.json(updated);
        } catch (error) {
            log.error("Error updating zone", { error: (error as Error).message });
            return res.status(500).json({ message: "Error updating zone" });
        }
    };

    deleteZone = async (req: Request, res: Response) => {
        try {
            await this.zoneRepo.delete(req.params.id);
            return res.status(204).send();
        } catch (error) {
            log.error("Error deleting zone", { error: (error as Error).message });
            return res.status(500).json({ message: "Error deleting zone" });
        }
    };

    /* ── Platform Settings ── */
    // NOTE: Settings are handled by the existing getSettings/updateSettings methods above
    // which use adminService and the country-based PlatformSettings model.

    /* ── Platform Withdrawals ── */

    getWithdrawals = async (req: Request, res: Response) => {
        try {
            const where = this.applyLocationFilter(req);
            const withdrawals = await this.withdrawalRepo.find({ where, order: { createdAt: "DESC" } });
            return res.json(withdrawals);
        } catch (error) {
            log.error("Error fetching withdrawals", { error: (error as Error).message });
            return res.status(500).json({ message: "Error fetching withdrawals" });
        }
    };

    createWithdrawal = async (req: Request, res: Response) => {
        try {
            const withdrawal = this.withdrawalRepo.create(req.body);
            await this.withdrawalRepo.save(withdrawal);
            return res.status(201).json(withdrawal);
        } catch (error) {
            log.error("Error creating withdrawal", { error: (error as Error).message });
            return res.status(500).json({ message: "Error creating withdrawal" });
        }
    };

    updateWithdrawal = async (req: Request, res: Response) => {
        try {
            await this.withdrawalRepo.update(req.params.id, req.body);
            const updated = await this.withdrawalRepo.findOneBy({ id: req.params.id });
            return res.json(updated);
        } catch (error) {
            log.error("Error updating withdrawal", { error: (error as Error).message });
            return res.status(500).json({ message: "Error updating withdrawal" });
        }
    };
}