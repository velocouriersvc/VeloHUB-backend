import { Response } from "express";
import { AuthRequest } from "../middleware/role-middleware";
import { RideService } from "../services/ride-service";
import { RedisLocationService } from "../services/redis-location-service";
import { RatingService } from "../services/rating-service";

export class DriverController {
    private rideService = new RideService();
    private redisLocation = new RedisLocationService();
    private ratingService = new RatingService();

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
        } catch (error: any) {
            console.error("Error updating location:", error);
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
        } catch (error: any) {
            console.error("Error going online:", error);
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
        } catch (error: any) {
            console.error("Error going offline:", error);
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
        } catch (error: any) {
            console.error("Error accepting ride:", error);
            return res.status(400).json({ message: error.message || "Internal server error" });
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
        } catch (error: any) {
            console.error("Error setting enroute:", error);
            return res.status(400).json({ message: error.message || "Internal server error" });
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
        } catch (error: any) {
            console.error("Error setting arrived:", error);
            return res.status(400).json({ message: error.message || "Internal server error" });
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
        } catch (error: any) {
            console.error("Error starting ride:", error);
            return res.status(400).json({ message: error.message || "Internal server error" });
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
        } catch (error: any) {
            console.error("Error completing ride:", error);
            return res.status(400).json({ message: error.message || "Internal server error" });
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
        } catch (error: any) {
            console.error("Error getting active ride:", error);
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
        } catch (error: any) {
            console.error("Error getting ride history:", error);
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
        } catch (error: any) {
            console.error("Error getting stats:", error);
            return res.status(500).json({ message: "Internal server error" });
        }
    };
}
