import { AppDataSource } from "../db/data-source";
import { DriverProfile, DriverVerificationStatus } from "../models/driver-profile";
import { RedisLocationService } from "./redis-location-service";
import { NotificationService } from "./notification-service";
import { VehicleType } from "../models/vehicle-pricing";
import { createServiceLogger } from "../utils/logger";
import { driverMatchEventsTotal } from "../utils/metrics";
import { emitToDriver } from "../socket-gateway";

const log = createServiceLogger("DriverMatchService");

// Driver search radius in km (20 km catchment per requirement)
const SEARCH_RADII = [20];

// A requested tier can be served by these driver vehicle types. Priority is a premium
// car tier (car x1.25), so car and priority drivers are mutually compatible. Without
// this, requests silently dropped when no driver held the EXACT tier - the reason some
// drivers (e.g. a car driver in a market that requests priority) never saw requests.
const VEHICLE_COMPATIBILITY: Record<string, VehicleType[]> = {
    [VehicleType.BIKE]: [VehicleType.BIKE],
    [VehicleType.CAR]: [VehicleType.CAR, VehicleType.PRIORITY],
    [VehicleType.PRIORITY]: [VehicleType.PRIORITY, VehicleType.CAR],
    [VehicleType.SUV]: [VehicleType.SUV],
    [VehicleType.TRUCK]: [VehicleType.TRUCK],
};

export interface MatchedDriver {
    driverId: string;
    userId: string;
    fullName: string;
    vehicleType: string;
    plateNumber: string;
    lat: number;
    lng: number;
    distanceKm: number;
}

export class DriverMatchService {
    private driverProfileRepo = AppDataSource.getRepository(DriverProfile);
    private redisLocation: RedisLocationService;
    private notificationService: NotificationService;

    constructor() {
        this.redisLocation = new RedisLocationService();
        this.notificationService = new NotificationService();
    }

    /**
     * Find available drivers near pickup location for a specific vehicle type.
     * Escalates search radius if no drivers found.
     */
    async findDrivers(
        pickupLat: number,
        pickupLng: number,
        vehicleType: VehicleType,
        excludeDriverIds: string[] = []
    ): Promise<MatchedDriver[]> {
        for (const radiusKm of SEARCH_RADII) {
            const drivers = await this.searchInRadius(
                pickupLat,
                pickupLng,
                radiusKm,
                vehicleType,
                excludeDriverIds
            );

            if (drivers.length > 0) {
                log.info("Drivers found", { count: drivers.length, radiusKm, vehicleType });
                driverMatchEventsTotal.inc({ result: "found" });
                return drivers;
            }
        }

        log.info("No drivers found in any radius", { vehicleType });
        driverMatchEventsTotal.inc({ result: "not_found" });
        return []; // No drivers found in any radius
    }

    /**
     * Search for drivers within a specific radius
     */
    private async searchInRadius(
        pickupLat: number,
        pickupLng: number,
        radiusKm: number,
        vehicleType: VehicleType,
        excludeDriverIds: string[]
    ): Promise<MatchedDriver[]> {
        // 1. Get nearby online drivers from Redis
        const nearbyDrivers = await this.redisLocation.findNearbyDrivers(
            pickupLat,
            pickupLng,
            radiusKm,
            excludeDriverIds
        );

        if (nearbyDrivers.length === 0) return [];

        // 2. Filter by vehicle type and verified status from DB
        const matched: MatchedDriver[] = [];

        for (const nearby of nearbyDrivers) {
            const profile = await this.driverProfileRepo.findOne({
                where: {
                    userId: nearby.driverId,
                    status: DriverVerificationStatus.APPROVED,
                },
            });

            if (!profile) continue;

            // Match vehicle type by compatibility (not strict equality), so a car/priority
            // request reaches both car and priority drivers.
            const compatible: string[] = VEHICLE_COMPATIBILITY[vehicleType] || [vehicleType];
            if (!compatible.includes(profile.vehicleType)) continue;

            matched.push({
                driverId: profile.id,
                userId: profile.userId,
                fullName: profile.fullName,
                vehicleType: profile.vehicleType,
                plateNumber: profile.plateNumber || "N/A",
                lat: nearby.location.lat,
                lng: nearby.location.lng,
                distanceKm: nearby.distanceKm,
            });
        }

        return matched;
    }

    /**
     * Broadcast a ride request to a list of drivers via push + WebSocket
     */
    async broadcastRideRequest(
        rideId: string,
        pickupAddress: string,
        driverUserIds: string[],
        rideData?: Record<string, any>
    ): Promise<void> {
        // Track broadcast in Redis
        await this.redisLocation.addToBroadcast(rideId, driverUserIds);
        log.info("Ride broadcasted to drivers", { rideId, driverCount: driverUserIds.length });

        // Notify each driver via push notification + WebSocket
        for (const driverUserId of driverUserIds) {
            // Push notification (in-app + Expo push)
            await this.notificationService.notifyNewRideRequest(
                driverUserId,
                pickupAddress,
                rideId,
                rideData?.type === "delivery"
            );

            // Real-time WebSocket event to the driver's personal room
            emitToDriver(driverUserId, "ride:new", {
                rideId,
                pickupAddress,
                ...rideData,
                ts: Date.now(),
            });
        }
    }

    /**
     * Get already-broadcasted drivers for a ride (to exclude on retry)
     */
    async getBroadcastedDrivers(rideId: string): Promise<string[]> {
        return this.redisLocation.getBroadcastedDrivers(rideId);
    }
}
