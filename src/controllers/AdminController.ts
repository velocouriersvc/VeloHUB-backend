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
import { ServiceBookingStatus } from "../models/service-booking";
import { Identification, IdentificationStatus } from "../models/identification";
import { NotificationService } from "../services/notification-service";
import { NotificationType } from "../models/notification";
import crypto from "crypto";

const log = createServiceLogger("AdminController");

export class AdminController {
    private userRepo = AppDataSource.getRepository(User);
    private driverRepo = AppDataSource.getRepository(DriverProfile);
    private merchantRepo = AppDataSource.getRepository(MerchantProfile);
    private identificationRepo = AppDataSource.getRepository(Identification);
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
     * POST /admin/merchants
     */
    createMerchant = async (req: AuthRequest, res: Response) => {
        try {
            const result = await this.adminService.createQuickMerchant(req.body);
            return res.json(result);
        } catch (error) {
            log.error("Error creating merchant:", error);
            return res.status(500).json({ message: "Internal server error" });
        }
    };

    getDrivers = async (req: Request, res: Response) => {
        try {
            const drivers = await this.driverRepo.find({
                relations: ["user", "identification"]
            });
            return res.json(drivers.map(d => ({
                id: d.userId,
                driver_profile_id: d.id,
                full_name: d.fullName,
                email: d.user?.email || "N/A",
                phone: d.user?.phoneNumber || "N/A",
                vehicle_type: d.vehicleType,
                vehicle_number: d.plateNumber,
                vehicle_model: d.vehicleModel,
                vehicle_color: d.vehicleColor,
                license_number: d.licenseNumber,
                license_photo_url: d.licensePhotoUrl,
                region: d.region,
                status: d.status,
                user_status: d.user?.status || "inactive",
                created_date: d.createdAt,
                // Identification documents
                identification_id: d.identification?.id || null,
                id_type: d.identification?.type || null,
                id_number: d.identification?.idNumber || null,
                id_front_url: d.identification?.frontUrl || null,
                id_back_url: d.identification?.backUrl || null,
                id_status: d.identification?.status || null,
                id_expiry: d.identification?.expiryDate || null,
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
                relations: ["user", "user.buyerProfile"]
            });
            return res.json(merchants.map(m => ({
                id: m.userId,
                business_name: m.businessName,
                owner_name: m.user?.buyerProfile?.fullName || m.user?.email || "N/A",
                email: m.businessEmail || m.user?.email,
                phone: m.businessPhone || m.user?.phoneNumber,
                category: m.category,
                status: m.status,
                logo_url: m.coverImageUrl,
                created_date: m.user?.createdAt || m.createdAt,
            })));
        } catch (error) {
            log.error("Error fetching merchants:", error);
            return res.status(500).json({ message: "Internal server error" });
        }
    };

    getMerchantById = async (req: Request, res: Response) => {
        try {
            const { id } = req.params;
            const merchant = await this.merchantRepo.findOne({
                where: { userId: id },
                relations: ["user", "user.buyerProfile"]
            });
            if (!merchant) return res.status(404).json({ message: "Merchant not found" });
            return res.json({
                id: merchant.userId,
                business_name: merchant.businessName,
                owner_name: merchant.user?.buyerProfile?.fullName || merchant.user?.email || "N/A",
                email: merchant.businessEmail || merchant.user?.email,
                phone: merchant.businessPhone || merchant.user?.phoneNumber,
                category: merchant.category,
                status: merchant.status,
                logo_url: merchant.coverImageUrl,
                description: merchant.description,
                commission_rate: merchant.commissionRate,
                address: merchant.address,
                created_date: merchant.user?.createdAt || merchant.createdAt,
            });
        } catch (error) {
            log.error("Error fetching merchant by ID:", error);
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
            const users = await this.adminService.getRiderStats();
            return res.json(users);
        } catch (error) {
            log.error("Error fetching users:", error);
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
     * POST /admin/drivers/:id/verify
     * Approve or reject a driver's verification, updating both driver profile and identification status.
     */
    verifyDriver = async (req: Request, res: Response) => {
        try {
            const userId = req.params.id;
            const { action, rejection_reason } = req.body; // action: 'approve' | 'reject'

            if (!action || !['approve', 'reject'].includes(action)) {
                return res.status(400).json({ message: "action must be 'approve' or 'reject'" });
            }

            const driver = await this.driverRepo.findOne({
                where: { userId },
                relations: ["identification", "user"],
            });
            if (!driver) return res.status(404).json({ message: "Driver not found" });

            // Find the driver role definition
            const driverRole = await this.roleRepo.findOneBy({ name: RoleType.DRIVER });
            if (!driverRole) return res.status(500).json({ message: "Driver role not found in system" });

            if (action === 'approve') {
                driver.status = DriverVerificationStatus.APPROVED;
                driver.user.status = UserStatus.ACTIVE;
                if (driver.identification) {
                    driver.identification.status = IdentificationStatus.VERIFIED;
                    await this.identificationRepo.save(driver.identification);
                }

                // Approve the user_role entry so the driver role shows up in auth responses
                let userRole = await this.userRoleRepo.findOneBy({ userId, roleId: driverRole.id });
                if (userRole) {
                    userRole.status = RoleStatus.APPROVED;
                    userRole.completedRequirements = true;
                    await this.userRoleRepo.save(userRole);
                } else {
                    // Create user_role if it doesn't exist (e.g. manual admin creation)
                    userRole = this.userRoleRepo.create({
                        userId,
                        roleId: driverRole.id,
                        status: RoleStatus.APPROVED,
                        completedRequirements: true,
                    });
                    await this.userRoleRepo.save(userRole);
                }
            } else {
                driver.status = DriverVerificationStatus.REJECTED;
                driver.user.status = UserStatus.SUSPENDED;
                if (driver.identification) {
                    driver.identification.status = IdentificationStatus.REJECTED;
                    await this.identificationRepo.save(driver.identification);
                }

                // Reject the user_role entry
                const userRole = await this.userRoleRepo.findOneBy({ userId, roleId: driverRole.id });
                if (userRole) {
                    userRole.status = RoleStatus.REJECTED;
                    await this.userRoleRepo.save(userRole);
                }
            }

            await this.userRepo.save(driver.user);
            await this.driverRepo.save(driver);

            await AuditLogController.record({
                action: action === 'approve' ? "Approve Driver" : "Reject Driver",
                entity_type: "driver",
                entity_id: userId,
                performed_by: (req as any).user?.email || "Admin",
                details: action === 'approve'
                    ? `Driver verified and approved`
                    : `Driver rejected: ${rejection_reason || 'No reason provided'}`,
                risk_level: AuditRiskLevel.MEDIUM,
            });

            // Send in-app + push notification to the driver
            const notificationService = new NotificationService();
            if (action === 'approve') {
                await notificationService.notify(
                    userId,
                    NotificationType.ROLE_APPROVED,
                    "You're Approved! 🎉",
                    "Your driver verification has been approved. You can now go online and start accepting rides and deliveries.",
                    { type: "driver_approved" }
                );
            } else {
                await notificationService.notify(
                    userId,
                    NotificationType.ROLE_REJECTED,
                    "Verification Update",
                    rejection_reason
                        ? `Your driver verification was not approved: ${rejection_reason}`
                        : "Your driver verification was not approved. Please review your documents and try again.",
                    { type: "driver_rejected", reason: rejection_reason || null }
                );
            }

            return res.json({
                message: `Driver ${action === 'approve' ? 'approved' : 'rejected'} successfully`,
                status: driver.status,
            });
        } catch (error) {
            console.error("Error verifying driver:", error);
            return res.status(500).json({ message: "Internal server error" });
        }
    };

    /**
     * PATCH /admin/merchants/:id
     * Updates merchant status and triggers side effects (roles, wallets, stats, notifications)
     */
    updateMerchantStatus = async (req: Request, res: Response) => {
        try {
            const userId = req.params.id;
            const { status } = req.body;
            const adminId = (req as any).user?.id || "Admin";

            let result;
            if (status === MerchantVerificationStatus.APPROVED) {
                result = await this.adminService.approveMerchant(userId, adminId);
            } else if (status === MerchantVerificationStatus.REJECTED) {
                result = await this.adminService.suspendMerchant(userId, adminId, "Rejected by admin");
            } else {
                const merchant = await this.merchantRepo.findOneBy({ userId });
                if (!merchant) return res.status(404).json({ message: "Merchant not found" });

                merchant.status = status as MerchantVerificationStatus;
                await this.merchantRepo.save(merchant);
                result = merchant;
            }

            await AuditLogController.record({
                action: "Update Merchant Status",
                entity_type: "merchant",
                entity_id: userId,
                performed_by: (req as any).user?.email || "Admin",
                details: `Status updated to ${status}`,
                risk_level: status === MerchantVerificationStatus.APPROVED ? AuditRiskLevel.MEDIUM : AuditRiskLevel.LOW
            });

            return res.json({ message: "Merchant status updated", status: result.status });
        } catch (error) {
            log.error("Error updating merchant status:", error);
            const msg = (error as Error).message;
            if (msg.includes("not found")) return res.status(404).json({ message: msg });
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

    syncMerchants = async (req: Request, res: Response) => {
        try {
            const adminId = (req as any).user.id;
            const results = await this.adminService.syncMerchants(adminId);
            return res.json({ message: "Sync complete", ...results });
        } catch (error) {
            const msg = (error as Error).message;
            log.error("Error syncing merchants", { error: msg });
            return res.status(500).json({ message: "Internal server error", error: msg });
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

    createProduct = async (req: AuthRequest, res: Response) => {
        try {
            const { merchantId, ...productData } = req.body;
            
            // Basic validation
            if (!merchantId) return res.status(400).json({ message: "merchantId is required" });
            if (!productData.name) return res.status(400).json({ message: "Product name is required" });
            if (productData.price === undefined || productData.price === null) {
                return res.status(400).json({ message: "Product price is required" });
            }
            if (!productData.category) return res.status(400).json({ message: "Product category is required" });

            const product = await this.adminService.createProduct(merchantId, productData);

            await AuditLogController.record({
                action: "Create Product",
                entity_type: "product",
                entity_id: product.id,
                performed_by: req.user?.email || "Admin",
                details: `Created product "${product.name}" for merchant ${merchantId}`,
                risk_level: AuditRiskLevel.LOW
            });

            return res.status(201).json(product);
        } catch (error) {
            log.error("Error creating product:", error);
            const msg = (error as Error).message || "Internal server error";
            return res.status(500).json({ message: msg });
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
    //  SERVICES
    // ════════════════════════════════════════════════════════════════

    getServiceProviders = async (req: AuthRequest, res: Response) => {
        try {
            const { search, status, page, limit } = req.query;
            const result = await this.adminService.getServiceProviders({
                search: search as string,
                status: status as MerchantVerificationStatus,
                page: page ? Number(page) : undefined,
                limit: limit ? Number(limit) : undefined,
            });
            return res.json(result);
        } catch (error) {
            log.error("Error getting service providers", { error: (error as Error).message });
            return res.status(500).json({ message: "Internal server error" });
        }
    };

    getServiceBookings = async (req: AuthRequest, res: Response) => {
        try {
            const { status, merchantId, page, limit } = req.query;
            const result = await this.adminService.getServiceBookings({
                status: status as ServiceBookingStatus,
                merchantId: merchantId as string,
                page: page ? Number(page) : undefined,
                limit: limit ? Number(limit) : undefined,
            });
            return res.json(result);
        } catch (error) {
            log.error("Error getting service bookings", { error: (error as Error).message });
            return res.status(500).json({ message: "Internal server error" });
        }
    };

    getServiceStats = async (req: AuthRequest, res: Response) => {
        try {
            const stats = await this.adminService.getServiceStats();
            return res.json(stats);
        } catch (error) {
            log.error("Error getting service stats", { error: (error as Error).message });
            return res.status(500).json({ message: "Internal server error" });
        }
    };

    approveServiceProvider = async (req: AuthRequest, res: Response) => {
        try {
            const adminId = (req as any).user.id;
            const profile = await this.adminService.approveServiceProvider(req.params.id, adminId);
            return res.json({ message: "Service provider approved", status: profile.status });
        } catch (error) {
            const msg = (error as Error).message;
            if (msg.includes("not found")) return res.status(404).json({ message: msg });
            log.error("Error approving service provider", { error: msg });
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

    getFinancialOverview = async (req: AuthRequest, res: Response) => {
        try {
            const { from, to } = req.query;
            const overview = await this.adminService.getFinancialOverview(
                from as string | undefined,
                to as string | undefined
            );
            return res.json(overview);
        } catch (error) {
            log.error("Error getting financial overview", { error: (error as Error).message });
            return res.status(500).json({ message: "Internal server error" });
        }
    };

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

    // ════════════════════════════════════════════════════════════════
    //  CAMPAIGNS (PROMOS & BANNERS)
    // ════════════════════════════════════════════════════════════════

    getPromoCodes = async (req: AuthRequest, res: Response) => {
        try {
            const promos = await this.adminService.getPromoCodes();
            return res.json(promos);
        } catch (error) {
            log.error("Error getting promo codes", { error: (error as Error).message });
            return res.status(500).json({ message: "Internal server error" });
        }
    }

    createPromoCode = async (req: AuthRequest, res: Response) => {
        try {
            const adminId = (req as any).user.id;
            const promo = await this.adminService.createPromoCode(req.body, adminId);
            return res.status(201).json(promo);
        } catch (error) {
            log.error("Error creating promo code", { error: (error as Error).message });
            return res.status(500).json({ message: "Internal server error" });
        }
    }

    updatePromoCode = async (req: AuthRequest, res: Response) => {
        try {
            const adminId = (req as any).user.id;
            const updated = await this.adminService.updatePromoCode(req.params.id, req.body, adminId);
            return res.json(updated);
        } catch (error) {
            log.error("Error updating promo code", { error: (error as Error).message });
            return res.status(500).json({ message: "Internal server error" });
        }
    }

    deletePromoCode = async (req: AuthRequest, res: Response) => {
        try {
            const adminId = (req as any).user.id;
            await this.adminService.deletePromoCode(req.params.id, adminId);
            return res.status(204).send();
        } catch (error) {
            log.error("Error deleting promo code", { error: (error as Error).message });
            return res.status(500).json({ message: "Internal server error" });
        }
    }

    getBanners = async (req: AuthRequest, res: Response) => {
        try {
            const banners = await this.adminService.getBanners();
            return res.json(banners);
        } catch (error) {
            log.error("Error getting banners", { error: (error as Error).message });
            return res.status(500).json({ message: "Internal server error" });
        }
    }

    createBanner = async (req: AuthRequest, res: Response) => {
        try {
            const adminId = (req as any).user.id;
            const banner = await this.adminService.createBanner(req.body, adminId);
            return res.status(201).json(banner);
        } catch (error) {
            log.error("Error creating banner", { error: (error as Error).message });
            return res.status(500).json({ message: "Internal server error" });
        }
    }

    updateBanner = async (req: AuthRequest, res: Response) => {
        try {
            const adminId = (req as any).user.id;
            const updated = await this.adminService.updateBanner(req.params.id, req.body, adminId);
            return res.json(updated);
        } catch (error) {
            log.error("Error updating banner", { error: (error as Error).message });
            return res.status(500).json({ message: "Internal server error" });
        }
    }

    deleteBanner = async (req: AuthRequest, res: Response) => {
        try {
            const adminId = (req as any).user.id;
            await this.adminService.deleteBanner(req.params.id, adminId);
            return res.status(204).send();
        } catch (error) {
            log.error("Error deleting banner", { error: (error as Error).message });
            return res.status(500).json({ message: "Internal server error" });
        }
    }

    broadcastNotification = async (req: AuthRequest, res: Response) => {
        try {
            const adminId = (req as any).user.id;
            const result = await this.adminService.broadcastNotification(req.body, adminId);
            return res.json(result);
        } catch (error) {
            log.error("Error broadcasting notification", { error: (error as Error).message });
            return res.status(500).json({ message: "Internal server error" });
        }
    }

    sendPrivateNotification = async (req: AuthRequest, res: Response) => {
        try {
            const adminId = (req as any).user.id;
            const { userId, title, body, data } = req.body;
            
            if (!userId || !title || !body) {
                return res.status(400).json({ message: "userId, title, and body are required" });
            }

            const result = await this.adminService.sendPrivateNotification(userId, { title, body, data }, adminId);
            return res.json(result);
        } catch (error) {
            log.error("Error sending private notification", { error: (error as Error).message });
            return res.status(500).json({ message: (error as Error).message || "Internal server error" });
        }
    }

    // ════════════════════════════════════════════════════════════════
    //  SUPPORT TICKETS
    // ════════════════════════════════════════════════════════════════

    getSupportTickets = async (req: AuthRequest, res: Response) => {
        try {
            const limit = req.query.limit ? parseInt(req.query.limit as string) : 200;
            const tickets = await this.adminService.getSupportTickets(limit);
            return res.json(tickets);
        } catch (error) {
            log.error("Error getting support tickets", { error: (error as Error).message });
            return res.status(500).json({ message: "Internal server error" });
        }
    }

    updateSupportTicket = async (req: AuthRequest, res: Response) => {
        try {
            const adminId = (req as any).user.id;
            const updated = await this.adminService.updateSupportTicket(req.params.id, req.body, adminId);
            return res.json(updated);
        } catch (error) {
            log.error("Error updating support ticket", { error: (error as Error).message });
            return res.status(500).json({ message: "Internal server error" });
        }
    }

    createSupportTicket = async (req: AuthRequest, res: Response) => {
        try {
            const userId = req.user?.id;
            if (!userId) return res.status(401).json({ message: "User ID required" });

            const { subject, description, category, priority } = req.body;
            if (!subject || !description) return res.status(400).json({ message: "Subject and description required" });

            const ticket = await this.adminService.createSupportTicket({
                userId,
                subject,
                description,
                category,
                priority
            });

            return res.status(201).json({ message: "Support ticket created", ticket });
        } catch (error) {
            log.error("Error creating support ticket", { error: (error as Error).message });
            return res.status(500).json({ message: "Internal server error" });
        }
    }

    // ════════════════════════════════════════════════════════════════
    //  FINANCE & SETTINGS
    // ════════════════════════════════════════════════════════════════

    exportOrdersCSV = async (req: AuthRequest, res: Response) => {
        try {
            const csv = await this.adminService.exportOrdersToCSV(req.query);
            res.setHeader("Content-Type", "text/csv");
            res.setHeader("Content-Disposition", `attachment; filename=orders_report_${new Date().toISOString().slice(0, 10)}.csv`);
            return res.status(200).send(csv);
        } catch (error) {
            log.error("Error exporting orders", { error: (error as Error).message });
            return res.status(500).json({ message: "Internal server error" });
        }
    }

    getPlatformSettings = async (req: AuthRequest, res: Response) => {
        try {
            const settings = await this.adminService.getPlatformSettings();
            return res.json(settings);
        } catch (error) {
            log.error("Error getting settings", { error: (error as Error).message });
            return res.status(500).json({ message: "Internal server error" });
        }
    }

    updatePlatformSetting = async (req: AuthRequest, res: Response) => {
        try {
            const adminId = (req as any).user.id;
            const updated = await this.adminService.updatePlatformSetting(req.params.id, req.body, adminId);
            return res.json(updated);
        } catch (error) {
            log.error("Error updating setting", { error: (error as Error).message });
            return res.status(500).json({ message: "Internal server error" });
        }
    }

    // ════════════════════════════════════════════════════════════════
    //  REFERRALS
    // ════════════════════════════════════════════════════════════════

    getReferralStats = async (req: AuthRequest, res: Response) => {
        try {
            const stats = await this.adminService.getReferralStats();
            return res.json(stats);
        } catch (error) {
            log.error("Error getting referral stats", { error: (error as Error).message });
            return res.status(500).json({ message: "Internal server error" });
        }
    }

    getReferrals = async (req: AuthRequest, res: Response) => {
        try {
            const limit = req.query.limit ? parseInt(req.query.limit as string) : 100;
            const referrals = await this.adminService.getReferrals(limit);
            return res.json(referrals);
        } catch (error) {
            log.error("Error getting referrals", { error: (error as Error).message });
            return res.status(500).json({ message: "Internal server error" });
        }
    }

    getReferralCode = async (req: AuthRequest, res: Response) => {
        try {
            const { userId } = req.params;
            const code = await this.adminService.getReferralCodeForUser(userId);
            return res.json(code);
        } catch (error) {
            const message = (error as Error).message;
            log.error("Error getting referral code", { error: message });
            
            if (message === "User not found") {
                return res.status(404).json({ message });
            }
            
            return res.status(500).json({ message: "Internal server error" });
        }
    }

    updateReferralStatus = async (req: AuthRequest, res: Response) => {
        try {
            const adminId = (req as any).user.id;
            const { status } = req.body;
            const updated = await this.adminService.updateReferralStatus(req.params.id, status, adminId);
            return res.json(updated);
        } catch (error) {
            log.error("Error updating referral status", { error: (error as Error).message });
            return res.status(500).json({ message: "Internal server error" });
        }
    }

    getBroadcasts = async (req: AuthRequest, res: Response) => {
        try {
            const history = await this.adminService.getBroadcasts();
            return res.json(history);
        } catch (error) {
            log.error("Error getting broadcasts", { error: (error as Error).message });
            return res.status(500).json({ message: "Internal server error" });
        }
    }

    getLeaderboard = async (req: AuthRequest, res: Response) => {
        try {
            const { type, country } = req.query as { type: 'riders' | 'customers' | 'drivers' | 'merchants' | 'services', country: string };
            if (!type || !country) {
                return res.status(400).json({ message: "Type and country are required" });
            }
            const leaderboard = await this.adminService.getLeaderboard(type, country);
            return res.json(leaderboard);
        } catch (error) {
            log.error("Error getting leaderboard", { error: (error as Error).message });
            return res.status(500).json({ message: "Internal server error" });
        }
    }

    getStaff = async (req: AuthRequest, res: Response) => {
        try {
            const staff = await this.adminService.getStaff();
            return res.json(staff);
        } catch (error) {
            log.error("Error getting staff", { error: (error as Error).message });
            return res.status(500).json({ message: "Internal server error" });
        }
    }

    createStaff = async (req: AuthRequest, res: Response) => {
        try {
            const staff = await this.adminService.createStaffMember(req.body);
            return res.status(201).json(staff);
        } catch (error) {
            log.error("Error creating staff member", { error: (error as Error).message });
            return res.status(error instanceof Error && error.message.includes("found") ? 404 : 400)
                .json({ message: (error as Error).message });
        }
    }

    updateStaff = async (req: AuthRequest, res: Response) => {
        try {
            const { id } = req.params;
            const staff = await this.adminService.updateStaffMember(id, req.body);
            return res.json(staff);
        } catch (error) {
            log.error("Error updating staff member", { error: (error as Error).message });
            return res.status(error instanceof Error && error.message.includes("found") ? 404 : 400)
                .json({ message: (error as Error).message });
        }
    }

    getCategories = async (req: AuthRequest, res: Response) => {
        try {
            const categories = await this.adminService.getMerchantCategories();
            return res.json(categories);
        } catch (error) {
            log.error("Error getting categories", { error: (error as Error).message });
            return res.status(500).json({ message: "Internal server error" });
        }
    }

    createCategory = async (req: AuthRequest, res: Response) => {
        try {
            const category = await this.adminService.createMerchantCategory(req.body);
            return res.status(201).json(category);
        } catch (error) {
            log.error("Error creating category", { error: (error as Error).message });
            return res.status(400).json({ message: (error as Error).message });
        }
    }

    updateCategory = async (req: AuthRequest, res: Response) => {
        try {
            const { id } = req.params;
            const category = await this.adminService.updateMerchantCategory(id, req.body);
            return res.json(category);
        } catch (error) {
            log.error("Error updating category", { error: (error as Error).message });
            return res.status(400).json({ message: (error as Error).message });
        }
    }

    deleteCategory = async (req: AuthRequest, res: Response) => {
        try {
            const { id } = req.params;
            await this.adminService.deleteMerchantCategory(id);
            return res.status(204).send();
        } catch (error) {
            log.error("Error deleting category", { error: (error as Error).message });
            return res.status(400).json({ message: (error as Error).message });
        }
    }

    getProductCategories = async (req: Request, res: Response) => {
        try {
            const { type } = req.query;
            const categories = await this.adminService.getProductCategories(type as string);
            return res.json(categories);
        } catch (error) {
            log.error("Error fetching product categories", { error: (error as Error).message });
            return res.status(500).json({ message: "Internal server error" });
        }
    }

    createProductCategory = async (req: AuthRequest, res: Response) => {
        try {
            const category = await this.adminService.createProductCategory(req.body);
            return res.json(category);
        } catch (error) {
            log.error("Error creating product category", { error: (error as Error).message });
            return res.status(400).json({ message: (error as Error).message });
        }
    }

    updateProductCategory = async (req: AuthRequest, res: Response) => {
        try {
            const { id } = req.params;
            const category = await this.adminService.updateProductCategory(id, req.body);
            return res.json(category);
        } catch (error) {
            log.error("Error updating product category", { error: (error as Error).message });
            return res.status(400).json({ message: (error as Error).message });
        }
    }

    deleteProductCategory = async (req: AuthRequest, res: Response) => {
        try {
            const { id } = req.params;
            await this.adminService.deleteProductCategory(id);
            return res.status(204).send();
        } catch (error) {
            log.error("Error deleting product category", { error: (error as Error).message });
            return res.status(400).json({ message: (error as Error).message });
        }
    }

    // ════════════════════════════════════════════════════════════════
    //  ZONES & SURGE
    // ════════════════════════════════════════════════════════════════

    updateGlobalSurge = async (req: AuthRequest, res: Response) => {
        try {
            const adminId = req.user?.id;
            if (!adminId) return res.status(401).json({ message: "User ID required" });

            const result = await this.adminService.updateGlobalSurge(req.body, adminId);
            
            await AuditLogController.record({
                action: "Update Global Surge",
                entity_type: "platform_settings",
                entity_id: "global",
                performed_by: req.user?.email || "Admin",
                details: `Global surge ${req.body.isActive ? 'activated' : 'deactivated'} at ${req.body.multiplier}x`,
                risk_level: AuditRiskLevel.MEDIUM
            });

            return res.json(result);
        } catch (error) {
            log.error("Error updating global surge", { error: (error as Error).message });
            return res.status(500).json({ message: "Internal server error" });
        }
    }

    updateUserRoles = async (req: AuthRequest, res: Response) => {
        try {
            const adminId = req.user?.id;
            if (!adminId) return res.status(401).json({ message: "User ID required" });

            const { id } = req.params;
            const { roles } = req.body;

            if (!Array.isArray(roles)) {
                return res.status(400).json({ message: "roles must be an array" });
            }

            const result = await this.adminService.updateUserRoles(id, roles as RoleType[], adminId);

            await AuditLogController.record({
                action: "Update User Roles",
                entity_type: "user",
                entity_id: id,
                performed_by: req.user?.email || "Admin",
                details: `Updated roles to: ${roles.join(", ")}`,
                risk_level: AuditRiskLevel.HIGH
            });

            return res.json(result);
        } catch (error) {
            log.error("Error updating user roles:", error);
            const msg = (error as Error).message;
            if (msg.includes("not found")) return res.status(404).json({ message: msg });
            return res.status(500).json({ message: "Internal server error" });
        }
    }

    // ════════════════════════════════════════════════════════════════
    //  VEHICLE PRICING
    // ════════════════════════════════════════════════════════════════

    getVehiclePricing = async (req: AuthRequest, res: Response) => {
        try {
            const country = req.query.country as string | undefined;
            const pricing = await this.adminService.getVehiclePricing(country);
            return res.json(pricing);
        } catch (error) {
            log.error("Error getting vehicle pricing", { error: (error as Error).message });
            return res.status(500).json({ message: "Internal server error" });
        }
    };

    updateVehiclePricing = async (req: AuthRequest, res: Response) => {
        try {
            const adminId = req.user?.id;
            if (!adminId) return res.status(401).json({ message: "User ID required" });
            const updated = await this.adminService.updateVehiclePricing(req.params.id, req.body, adminId);
            return res.json(updated);
        } catch (error) {
            log.error("Error updating vehicle pricing", { error: (error as Error).message });
            const msg = (error as Error).message;
            if (msg.includes("not found")) return res.status(404).json({ message: msg });
            return res.status(500).json({ message: "Internal server error" });
        }
    };
}
