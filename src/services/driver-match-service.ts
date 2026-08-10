import { AppDataSource } from "../db/data-source";
import { In } from "typeorm";
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

// Drivers store a free-text vehicle type from onboarding ("Car", "Motorcycle", "Van", ...),
// but matching compares against the backend enum (bike/car/priority/suv/truck). Without this
// mapping, "Car" never equals "car", so EVERY online driver was filtered out for EVERY tier:
// estimates showed "No drivers" and real requests never reached a driver. Normalize here so
// the free-text onboarding vocabulary (and common synonyms) resolves to the right tier.
export function normalizeVehicleType(raw?: string | null): VehicleType {
    const v = String(raw || "").trim().toLowerCase();
    if (/(^|[^a-z])(motor|bike|bicycle|tricycle|scooter|moto|okada|keke)/.test(v)) return VehicleType.BIKE;
    if (/(suv|van|minivan|jeep|crossover|wagon)/.test(v)) return VehicleType.SUV;
    if (/(truck|pickup|lorry|trailer)/.test(v)) return VehicleType.TRUCK;
    if (/(priority)/.test(v)) return VehicleType.PRIORITY;
    if (/(car|sedan|hatchback|saloon|taxi)/.test(v)) return VehicleType.CAR;
    // Already an enum value passes straight through; anything unknown falls back to car
    // (the safe majority tier) so a mis-typed onboarding value still receives requests.
    if ((Object.values(VehicleType) as string[]).includes(v)) return v as VehicleType;
    return VehicleType.CAR;
}

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
            // request reaches both car and priority drivers. The driver's stored type is
            // free text ("Car", "Motorcycle", ...), so normalize it to the enum first.
            const driverType = normalizeVehicleType(profile.vehicleType);
            const compatible: string[] = VEHICLE_COMPATIBILITY[vehicleType] || [vehicleType];
            if (!compatible.includes(driverType)) continue;

            matched.push({
                driverId: profile.id,
                userId: profile.userId,
                fullName: profile.fullName,
                vehicleType: driverType,
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

        // Count this as an "offer" for each recipient (drives the acceptance-rate stat).
        if (driverUserIds.length) {
            await this.driverProfileRepo.increment({ userId: In(driverUserIds) }, "ridesOffered", 1).catch(() => {});
        }

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
