import { Response } from "express";
import { AuthRequest } from "../middleware/role-middleware";
import { RideService } from "../services/ride-service";
import { RedisLocationService } from "../services/redis-location-service";
import { RatingService } from "../services/rating-service";
import { createServiceLogger } from "../utils/logger";
import { AppDataSource } from "../db/data-source";
import { DriverProfile } from "../models/driver-profile";
import { Identification } from "../models/identification";
import { User } from "../models/user";
import { UserProfile } from "../models/user-profile";
import { rewriteToPublicAssetUrl } from "../services/upload-service";

const log = createServiceLogger("DriverController");

export class DriverController {
    private rideService = new RideService();
    private redisLocation = new RedisLocationService();
    private ratingService = new RatingService();
    private driverProfileRepo = AppDataSource.getRepository(DriverProfile);
    private identificationRepo = AppDataSource.getRepository(Identification);
    private userRepo = AppDataSource.getRepository(User);
    private userProfileRepo = AppDataSource.getRepository(UserProfile);

    /**
     * POST /driver/location
     * Update driver's live location
     */
    updateLocation = async (req: AuthRequest, res: Response) => {
        try {
            const userId = req.user?.id;
            if (!userId) return res.status(401).json({ message: "User ID required" });

            const { lat, lng, heading, speed } = req.body;

            if (lat === undefined || lng === undefined) {
                return res.status(400).json({ message: "lat and lng are required" });
            }

            await this.redisLocation.updateDriverLocation(userId, Number(lat), Number(lng), heading, speed);
            return res.json({ message: "Location updated" });
        } catch (error) {
            log.error("Error updating location", { error: (error as Error).message });
            return res.status(500).json({ message: "Internal server error" });
        }
    };

    /**
     * POST /driver/online
     * Set driver status to online
     */
    goOnline = async (req: AuthRequest, res: Response) => {
        try {
            const userId = req.user?.id;
            if (!userId) return res.status(401).json({ message: "User ID required" });

            const { lat, lng } = req.body;

            if (lat === undefined || lng === undefined) {
                return res.status(400).json({ message: "lat and lng required to go online" });
            }

            await this.redisLocation.updateDriverLocation(userId, Number(lat), Number(lng));
            await this.redisLocation.setDriverStatus(userId, "online");

            return res.json({ message: "You are now online", status: "online" });
        } catch (error) {
            log.error("Error going online", { error: (error as Error).message });
            return res.status(500).json({ message: "Internal server error" });
        }
    };

    /**
     * POST /driver/offline
     * Set driver status to offline
     */
    goOffline = async (req: AuthRequest, res: Response) => {
        try {
            const userId = req.user?.id;
            if (!userId) return res.status(401).json({ message: "User ID required" });

            await this.redisLocation.removeDriver(userId);
            return res.json({ message: "You are now offline", status: "offline" });
        } catch (error) {
            log.error("Error going offline", { error: (error as Error).message });
            return res.status(500).json({ message: "Internal server error" });
        }
    };

    /**
     * POST /driver/rides/:id/accept
     * Accept a ride request
     */
    acceptRide = async (req: AuthRequest, res: Response) => {
        try {
            const userId = req.user?.id;
            if (!userId) return res.status(401).json({ message: "User ID required" });

            const rideId = req.params.id;
            const { driverName } = req.body;

            if (!driverName) {
                return res.status(400).json({ message: "driverName is required" });
            }

            const ride = await this.rideService.acceptRide(rideId, userId, driverName);
            return res.json({ ride });
        } catch (error) {
            log.error("Error accepting ride", { error: (error as Error).message });
            return res.status(400).json({ message: (error as Error).message || "Internal server error" });
        }
    };

    /**
     * POST /driver/rides/:id/enroute
     * Driver en route to pickup
     */
    enroute = async (req: AuthRequest, res: Response) => {
        try {
            const rideId = req.params.id;
            const { driverName } = req.body;

            const ride = await this.rideService.driverEnroute(rideId, driverName || "Driver");
            return res.json({ ride });
        } catch (error) {
            log.error("Error setting enroute", { error: (error as Error).message });
            return res.status(400).json({ message: (error as Error).message || "Internal server error" });
        }
    };

    /**
     * POST /driver/rides/:id/arrived
     * Driver arrived at pickup
     */
    arrived = async (req: AuthRequest, res: Response) => {
        try {
            const rideId = req.params.id;
            const { driverName } = req.body;

            const ride = await this.rideService.driverArrived(rideId, driverName || "Driver");
            return res.json({ ride });
        } catch (error) {
            log.error("Error setting arrived", { error: (error as Error).message });
            return res.status(400).json({ message: (error as Error).message || "Internal server error" });
        }
    };

    /**
     * POST /driver/rides/:id/start
     * Start the ride
     */
    startRide = async (req: AuthRequest, res: Response) => {
        try {
            const ride = await this.rideService.startRide(req.params.id);
            return res.json({ ride });
        } catch (error) {
            log.error("Error starting ride", { error: (error as Error).message });
            return res.status(400).json({ message: (error as Error).message || "Internal server error" });
        }
    };

    /**
     * POST /driver/rides/:id/complete
     * Complete the ride
     */
    completeRide = async (req: AuthRequest, res: Response) => {
        try {
            const ride = await this.rideService.completeRide(req.params.id);
            return res.json({ ride });
        } catch (error) {
            log.error("Error completing ride", { error: (error as Error).message });
            return res.status(400).json({ message: (error as Error).message || "Internal server error" });
        }
    };

    /**
     * GET /driver/rides/active
     * Get driver's current active ride
     */
    getActiveRide = async (req: AuthRequest, res: Response) => {
        try {
            const userId = req.user?.id;
            if (!userId) return res.status(401).json({ message: "User ID required" });

            const ride = await this.rideService.getDriverActiveRide(userId);
            return res.json({ ride });
        } catch (error) {
            log.error("Error getting active ride", { error: (error as Error).message });
            return res.status(500).json({ message: "Internal server error" });
        }
    };

    /**
     * GET /driver/rides/history
     * Get driver's ride history
     */
    getRideHistory = async (req: AuthRequest, res: Response) => {
        try {
            const userId = req.user?.id;
            if (!userId) return res.status(401).json({ message: "User ID required" });

            const limit = Number(req.query.limit) || 20;
            const offset = Number(req.query.offset) || 0;

            const result = await this.rideService.getDriverRides(userId, limit, offset);
            return res.json(result);
        } catch (error) {
            log.error("Error getting ride history", { error: (error as Error).message });
            return res.status(500).json({ message: "Internal server error" });
        }
    };

    /**
     * GET /driver/stats
     * Get driver's stats (rating, total rides, earnings)
     */
    getStats = async (req: AuthRequest, res: Response) => {
        try {
            const userId = req.user?.id;
            if (!userId) return res.status(401).json({ message: "User ID required" });

            const stats = await this.ratingService.getOrCreateDriverStats(userId);
            return res.json({ stats });
        } catch (error) {
            log.error("Error getting stats", { error: (error as Error).message });
            return res.status(500).json({ message: "Internal server error" });
        }
    };

    /**
     * GET /driver/profile
     * Get the driver's own profile (vehicle info, documents, verification status)
     */
    getProfile = async (req: AuthRequest, res: Response) => {
        try {
            const userId = req.user?.id;
            if (!userId) return res.status(401).json({ message: "User ID required" });

            const driverProfile = await this.driverProfileRepo.findOne({
                where: { userId },
                relations: ["identification"],
            });

            if (!driverProfile) {
                return res.status(404).json({ message: "Driver profile not found" });
            }

            const user = await this.userRepo.findOne({ where: { id: userId } });
            const userProfile = await this.userProfileRepo.findOne({ where: { userId } });

            const profileImageUrl = userProfile?.profileImageUrl
                ? rewriteToPublicAssetUrl(userProfile.profileImageUrl)
                : null;

            const licensePhotoUrl = driverProfile.licensePhotoUrl
                ? rewriteToPublicAssetUrl(driverProfile.licensePhotoUrl)
                : null;

            const identification = driverProfile.identification;

            return res.json({
                profile: {
                    id: driverProfile.id,
                    fullName: driverProfile.fullName,
                    phoneNumber: user?.phoneNumber || null,
                    email: user?.email || null,
                    profileImageUrl,
                    vehicleType: driverProfile.vehicleType,
                    vehicleModel: driverProfile.vehicleModel,
                    vehicleColor: driverProfile.vehicleColor,
                    plateNumber: driverProfile.plateNumber,
                    licenseNumber: driverProfile.licenseNumber,
                    licensePhotoUrl,
                    region: driverProfile.region,
                    verificationStatus: driverProfile.status,
                    identification: identification ? {
                        idType: identification.type,
                        idNumber: identification.idNumber,
                        idFrontUrl: rewriteToPublicAssetUrl(identification.frontUrl),
                        idBackUrl: rewriteToPublicAssetUrl(identification.backUrl),
                        status: identification.status,
                        expiryDate: identification.expiryDate,
                    } : null,
                    createdAt: driverProfile.createdAt,
                },
            });
        } catch (error) {
            log.error("Error getting driver profile", { error: (error as Error).message });
            return res.status(500).json({ message: "Internal server error" });
        }
    };

    /**
     * PUT /driver/profile
     * Update driver's own profile (name, vehicle info)
     */
    updateProfile = async (req: AuthRequest, res: Response) => {
        try {
            const userId = req.user?.id;
            if (!userId) return res.status(401).json({ message: "User ID required" });

            const driverProfile = await this.driverProfileRepo.findOne({ where: { userId } });
            if (!driverProfile) {
                return res.status(404).json({ message: "Driver profile not found" });
            }

            const { fullName, vehicleModel, vehicleColor, plateNumber } = req.body;
            if (fullName) driverProfile.fullName = fullName;
            if (vehicleModel) driverProfile.vehicleModel = vehicleModel;
            if (vehicleColor) driverProfile.vehicleColor = vehicleColor;
            if (plateNumber) driverProfile.plateNumber = plateNumber;

            await this.driverProfileRepo.save(driverProfile);

            return res.json({ message: "Profile updated", profile: driverProfile });
        } catch (error) {
            log.error("Error updating driver profile", { error: (error as Error).message });
            return res.status(500).json({ message: "Internal server error" });
        }
    };
}
