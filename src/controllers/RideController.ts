import { Response } from "express";
import { AuthRequest } from "../middleware/role-middleware";
import { RideService } from "../services/ride-service";
import { RideType, CancelledBy, PaymentMethod } from "../models/ride";
import { VehicleType } from "../models/vehicle-pricing";
import { PricingVertical } from "../config/pricing";
import { createServiceLogger } from "../utils/logger";

/** Parse an optional vertical from the request body (defaults to RIDES). */
function parseVertical(input: unknown): PricingVertical {
    const v = String(input || "").toLowerCase();
    return (Object.values(PricingVertical) as string[]).includes(v)
        ? (v as PricingVertical)
        : PricingVertical.RIDES;
}

const log = createServiceLogger("RideController");

/**
 * Map frontend vehicle type names to backend enum values.
 * Frontend sends: motorbike | car | van
 * Backend enum:   bike     | car | suv | truck
 */
function mapVehicleType(input: string): VehicleType {
    const map: Record<string, VehicleType> = {
        motorbike: VehicleType.BIKE,
        bike: VehicleType.BIKE,
        car: VehicleType.CAR,
        suv: VehicleType.SUV,
        van: VehicleType.TRUCK,
        truck: VehicleType.TRUCK,
    };
    return map[input?.toLowerCase()] || VehicleType.CAR;
}

export class RideController {
    private rideService = new RideService();

    /**
     * POST /rides/estimate
     * Get fare estimates for all vehicle types
     */
    getEstimates = async (req: AuthRequest, res: Response) => {
        try {
            const { distanceKm, durationMin, pickupLat, pickupLng, promoCode, country } = req.body;

            if (!distanceKm || !durationMin || !pickupLat || !pickupLng) {
                return res.status(400).json({ message: "distanceKm, durationMin, pickupLat, pickupLng are required" });
            }

            const estimates = await this.rideService.getAllFareEstimates(
                Number(distanceKm),
                Number(durationMin),
                Number(pickupLat),
                Number(pickupLng),
                promoCode,
                country,
                parseVertical(req.body.vertical)
            );

            return res.json({ estimates });
        } catch (error) {
            log.error("Error getting estimates", { error: (error as Error).message });
            return res.status(500).json({ message: (error as Error).message || "Internal server error" });
        }
    };

    /**
     * POST /rides/estimate/:vehicleType
     * Get fare estimate for a specific vehicle type
     */
    getEstimate = async (req: AuthRequest, res: Response) => {
        try {
            const vehicleType = mapVehicleType(req.params.vehicleType);
            const { distanceKm, durationMin, pickupLat, pickupLng, promoCode, country } = req.body;

            if (!distanceKm || !durationMin || !pickupLat || !pickupLng) {
                return res.status(400).json({ message: "distanceKm, durationMin, pickupLat, pickupLng are required" });
            }

            const estimate = await this.rideService.getFareEstimate(
                vehicleType,
                Number(distanceKm),
                Number(durationMin),
                Number(pickupLat),
                Number(pickupLng),
                promoCode,
                country,
                parseVertical(req.body.vertical)
            );

            return res.json({ estimate });
        } catch (error) {
            log.error("Error getting estimate", { error: (error as Error).message });
            return res.status(500).json({ message: (error as Error).message || "Internal server error" });
        }
    };

    /**
     * POST /rides/request
     * Customer requests a ride
     */
    requestRide = async (req: AuthRequest, res: Response) => {
        try {
            const userId = req.user?.id;
            if (!userId) return res.status(401).json({ message: "User ID required" });

            const {
                type, pickupAddress, pickupLat, pickupLng,
                dropoffAddress, dropoffLat, dropoffLng,
                vehicleType, distanceKm, durationMin,
                passengerCount, promoCode, stops, sharedContacts,
                country,
            } = req.body;

            if (!pickupAddress || !pickupLat || !dropoffAddress || !dropoffLat || !vehicleType || !distanceKm || !durationMin) {
                return res.status(400).json({ message: "Missing required ride fields" });
            }

            const ride = await this.rideService.requestRide({
                customerId: userId,
                type: type || RideType.RIDE,
                pickupAddress,
                pickupLat: Number(pickupLat),
                pickupLng: Number(pickupLng),
                dropoffAddress,
                dropoffLat: Number(dropoffLat),
                dropoffLng: Number(dropoffLng),
                vehicleType: mapVehicleType(vehicleType),
                distanceKm: Number(distanceKm),
                durationMin: Number(durationMin),
                passengerCount,
                promoCode,
                country,
                stops,
                sharedContacts,
            });

            return res.status(201).json({ ride });
        } catch (error) {
            log.error("Error requesting ride", { error: (error as Error).message });
            return res.status(500).json({ message: (error as Error).message || "Internal server error" });
        }
    };

    /**
     * POST /rides/:id/payment
     * Set payment method and process payment
     */
    setPayment = async (req: AuthRequest, res: Response) => {
        try {
            const rideId = req.params.id;
            const { paymentMethod, email } = req.body;
            const phoneNumber = req.body.phoneNumber;

            if (!paymentMethod) {
                return res.status(400).json({ message: "paymentMethod is required" });
            }

            const ride = await this.rideService.setPaymentMethod(
                rideId,
                paymentMethod as PaymentMethod,
                phoneNumber,
                email
            );

            return res.json({ ride });
        } catch (error) {
            log.error("Error setting payment", { error: (error as Error).message });
            return res.status(400).json({ message: (error as Error).message || "Internal server error" });
        }
    };

    /**
     * POST /rides/:id/cancel
     * Cancel a ride
     */
    cancelRide = async (req: AuthRequest, res: Response) => {
        try {
            const rideId = req.params.id;
            const userId = req.user?.id;
            if (!userId) return res.status(401).json({ message: "User ID required" });

            const { reason, fullRefund } = req.body;

            // Determine who's cancelling based on their role
            const roles = req.user?.roles || [];
            const isDriver = roles.some((r: any) => (typeof r === "string" ? r : r.name) === "driver");
            const cancelledBy = isDriver
                ? CancelledBy.DRIVER
                : CancelledBy.CUSTOMER;

            const ride = await this.rideService.cancelRide(rideId, cancelledBy, reason, !!fullRefund);
            return res.json({ ride });
        } catch (error) {
            log.error("Error cancelling ride", { error: (error as Error).message });
            return res.status(400).json({ message: (error as Error).message || "Internal server error" });
        }
    };

    /**
     * GET /rides/:id
     * Get ride details
     */
    getRide = async (req: AuthRequest, res: Response) => {
        try {
            const ride = await this.rideService.getRideById(req.params.id);
            if (!ride) return res.status(404).json({ message: "Ride not found" });
            return res.json({ ride });
        } catch (error) {
            log.error("Error getting ride", { error: (error as Error).message });
            return res.status(500).json({ message: "Internal server error" });
        }
    };

    /**
     * GET /rides/active
     * Get customer's active ride
     */
    getActiveRide = async (req: AuthRequest, res: Response) => {
        try {
            const userId = req.user?.id;
            if (!userId) return res.status(401).json({ message: "User ID required" });

            const ride = await this.rideService.getActiveRide(userId);
            return res.json({ ride });
        } catch (error) {
            log.error("Error getting active ride", { error: (error as Error).message });
            return res.status(500).json({ message: "Internal server error" });
        }
    };

    /**
     * GET /rides/history
     * Get customer's ride history
     */
    getRideHistory = async (req: AuthRequest, res: Response) => {
        try {
            const userId = req.user?.id;
            if (!userId) return res.status(401).json({ message: "User ID required" });

            const limit = Number(req.query.limit) || 20;
            const offset = Number(req.query.offset) || 0;

            const result = await this.rideService.getCustomerRides(userId, limit, offset);
            return res.json(result);
        } catch (error) {
            log.error("Error getting ride history", { error: (error as Error).message });
            return res.status(500).json({ message: "Internal server error" });
        }
    };

    /**
     * POST /rides/nearby-drivers
     * Get nearby drivers for the map overlay
     */
    getNearbyDrivers = async (req: AuthRequest, res: Response) => {
        try {
            const { lat, lng, radiusKm } = req.body;
            if (!lat || !lng) {
                return res.status(400).json({ message: "lat and lng are required" });
            }

            const locationService = new (await import("../services/redis-location-service")).RedisLocationService();
            const nearby = await locationService.findNearbyDrivers(
                Number(lat),
                Number(lng),
                Number(radiusKm) || 10,
            );
            return res.json({ drivers: nearby });
        } catch (error) {
            log.error("Error getting nearby drivers", { error: (error as Error).message });
            return res.status(500).json({ message: "Internal server error" });
        }
    };
}
