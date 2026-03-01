import { AppDataSource } from "../db/data-source";
import { Rating } from "../models/rating";
import { DriverStats } from "../models/driver-stats";
import { Ride, RideStatus } from "../models/ride";
import { NotificationService } from "./notification-service";

export class RatingService {
    private ratingRepo = AppDataSource.getRepository(Rating);
    private statsRepo = AppDataSource.getRepository(DriverStats);
    private rideRepo = AppDataSource.getRepository(Ride);
    private notificationService: NotificationService;

    constructor() {
        this.notificationService = new NotificationService();
    }

    /**
     * Rate a completed ride (customer rates driver)
     */
    async rateRide(
        rideId: string,
        customerId: string,
        rating: number,
        comment?: string
    ): Promise<Rating> {
        // Validate ride
        const ride = await this.rideRepo.findOne({ where: { id: rideId } });
        if (!ride) throw new Error("Ride not found");
        if (ride.status !== RideStatus.COMPLETED) throw new Error("Can only rate completed rides");
        if (ride.customerId !== customerId) throw new Error("Only the customer can rate this ride");
        if (!ride.driverId) throw new Error("No driver assigned to this ride");

        // Check for existing rating
        const existing = await this.ratingRepo.findOne({ where: { rideId } });
        if (existing) throw new Error("This ride has already been rated");

        // Validate rating value
        if (rating < 1 || rating > 5) throw new Error("Rating must be between 1 and 5");

        // Save rating
        const newRating = this.ratingRepo.create({
            rideId,
            driverId: ride.driverId,
            customerId,
            rating,
            comment: comment || null,
        });
        const savedRating = await this.ratingRepo.save(newRating);

        // Update driver stats
        await this.updateDriverStats(ride.driverId);

        // Notify driver
        await this.notificationService.notifyNewRating(ride.driverId, rating, rideId);

        return savedRating;
    }

    /**
     * Get rating for a specific ride
     */
    async getRideRating(rideId: string): Promise<Rating | null> {
        return this.ratingRepo.findOne({ where: { rideId } });
    }

    /**
     * Get driver's stats
     */
    async getDriverStats(driverId: string): Promise<DriverStats | null> {
        return this.statsRepo.findOne({ where: { driverId } });
    }

    /**
     * Get or create driver stats record
     */
    async getOrCreateDriverStats(driverId: string): Promise<DriverStats> {
        let stats = await this.statsRepo.findOne({ where: { driverId } });

        if (!stats) {
            stats = this.statsRepo.create({
                driverId,
                totalRides: 0,
                totalEarnings: 0,
                averageRating: 0,
                ratingCount: 0,
            });
            stats = await this.statsRepo.save(stats);
        }

        return stats;
    }

    /**
     * Recalculate driver stats from all ratings
     */
    private async updateDriverStats(driverId: string): Promise<void> {
        const stats = await this.getOrCreateDriverStats(driverId);

        // Get all ratings for this driver
        const ratings = await this.ratingRepo.find({ where: { driverId } });

        if (ratings.length === 0) return;

        const sum = ratings.reduce((acc, r) => acc + r.rating, 0);
        const avg = Math.round((sum / ratings.length) * 100) / 100;

        // Count completed rides
        const completedRides = await this.rideRepo.count({
            where: { driverId, status: RideStatus.COMPLETED },
        });

        stats.ratingCount = ratings.length;
        stats.averageRating = avg;
        stats.totalRides = completedRides;

        await this.statsRepo.save(stats);
    }

    /**
     * Increment driver's total earnings (called after ride completion)
     */
    async addDriverEarnings(driverId: string, amount: number): Promise<void> {
        const stats = await this.getOrCreateDriverStats(driverId);
        stats.totalEarnings = Number(stats.totalEarnings) + amount;
        await this.statsRepo.save(stats);
    }

    /**
     * Get recent ratings for a driver
     */
    async getDriverRatings(
        driverId: string,
        limit: number = 20,
        offset: number = 0
    ): Promise<{ ratings: Rating[]; total: number }> {
        const [ratings, total] = await this.ratingRepo.findAndCount({
            where: { driverId },
            order: { createdAt: "DESC" },
            take: limit,
            skip: offset,
        });

        return { ratings, total };
    }
}
