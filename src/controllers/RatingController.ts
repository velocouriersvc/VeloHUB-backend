import { Response } from "express";
import { AuthRequest } from "../middleware/role-middleware";
import { RatingService } from "../services/rating-service";
import { createServiceLogger } from "../utils/logger";

const log = createServiceLogger("RatingController");

export class RatingController {
    private ratingService = new RatingService();

    /**
     * POST /ratings
     * Rate a completed ride
     */
    rateRide = async (req: AuthRequest, res: Response) => {
        try {
            const userId = req.user?.id;
            if (!userId) return res.status(401).json({ message: "User ID required" });

            const { rideId, rating, comment } = req.body;

            if (!rideId || rating === undefined) {
                return res.status(400).json({ message: "rideId and rating are required" });
            }

            const result = await this.ratingService.rateRide(rideId, userId, Number(rating), comment);
            return res.status(201).json({ rating: result });
        } catch (error: any) {
            log.error("Error rating ride", { error: (error as Error).message });
            return res.status(400).json({ message: error.message || "Internal server error" });
        }
    };

    /**
     * GET /ratings/ride/:rideId
     * Get rating for a specific ride
     */
    getRideRating = async (req: AuthRequest, res: Response) => {
        try {
            const rating = await this.ratingService.getRideRating(req.params.rideId);
            return res.json({ rating });
        } catch (error: any) {
            log.error("Error getting rating", { error: (error as Error).message });
            return res.status(500).json({ message: "Internal server error" });
        }
    };

    /**
     * GET /ratings/driver/:driverId
     * Get ratings for a driver
     */
    getDriverRatings = async (req: AuthRequest, res: Response) => {
        try {
            const driverId = req.params.driverId;
            const limit = Number(req.query.limit) || 20;
            const offset = Number(req.query.offset) || 0;

            const result = await this.ratingService.getDriverRatings(driverId, limit, offset);
            return res.json(result);
        } catch (error: any) {
            log.error("Error getting driver ratings", { error: (error as Error).message });
            return res.status(500).json({ message: "Internal server error" });
        }
    };
}
