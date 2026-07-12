import { redis } from "../utils/redis";
import { createServiceLogger } from "../utils/logger";

const log = createServiceLogger("RedisLocationService");

// Redis key prefixes
const DRIVER_LOCATION_KEY = "driver:location";       // Hash: {lat, lng, heading, speed}
const DRIVER_STATUS_KEY = "driver:status";            // String: online/busy
const DRIVER_ACTIVE_RIDE_KEY = "driver:active-ride"; // String: rideId
const RIDE_TRACKING_KEY = "ride:tracking";             // Hash: ride tracking data
const RIDE_BROADCAST_KEY = "ride:broadcast";           // Set: driver IDs who received the broadcast

// TTLs in seconds
const DRIVER_LOCATION_TTL = 300;   // 5 minutes
const DRIVER_STATUS_TTL = 300;     // 5 minutes
const RIDE_TRACKING_TTL = 7200;    // 2 hours
const RIDE_BROADCAST_TTL = 600;    // 10 minutes

export interface DriverLocation {
    lat: number;
    lng: number;
    heading?: number;
    speed?: number;
    updatedAt: string;
}

export class RedisLocationService {
    /**
     * Update driver's live location
     */
    async updateDriverLocation(
        driverId: string,
        lat: number,
        lng: number,
        heading?: number,
        speed?: number
    ): Promise<void> {
        const key = `${DRIVER_LOCATION_KEY}:${driverId}`;
        const data: Record<string, string> = {
            lat: lat.toString(),
            lng: lng.toString(),
            updatedAt: new Date().toISOString(),
        };
        if (heading !== undefined) data.heading = heading.toString();
        if (speed !== undefined) data.speed = speed.toString();

        await redis.hset(key, data);
        await redis.expire(key, DRIVER_LOCATION_TTL);
    }

    /**
     * Get driver's current location
     */
    async getDriverLocation(driverId: string): Promise<DriverLocation | null> {
        const key = `${DRIVER_LOCATION_KEY}:${driverId}`;
        const data = await redis.hgetall(key);

        if (!data || !data.lat) return null;

        return {
            lat: parseFloat(data.lat),
            lng: parseFloat(data.lng),
            heading: data.heading ? parseFloat(data.heading) : undefined,
            speed: data.speed ? parseFloat(data.speed) : undefined,
            updatedAt: data.updatedAt,
        };
    }

    /**
     * Set driver online/busy status
     */
    async setDriverStatus(driverId: string, status: "online" | "busy"): Promise<void> {
        const key = `${DRIVER_STATUS_KEY}:${driverId}`;
        await redis.set(key, status, "EX", DRIVER_STATUS_TTL);
    }

    /**
     * Keep a streaming driver's status alive without changing its value ("busy" stays
     * busy). If the status already expired, the driver is actively streaming, so restore
     * "online". Prevents drivers silently dropping out of matching after 5 minutes.
     */
    async touchDriverStatus(driverId: string): Promise<void> {
        const key = `${DRIVER_STATUS_KEY}:${driverId}`;
        const refreshed = await redis.expire(key, DRIVER_STATUS_TTL);
        if (!refreshed) {
            await redis.set(key, "online", "EX", DRIVER_STATUS_TTL);
        }
    }

    /**
     * Get driver status
     */
    async getDriverStatus(driverId: string): Promise<string | null> {
        return redis.get(`${DRIVER_STATUS_KEY}:${driverId}`);
    }

    /**
     * Remove driver from Redis (offline)
     */
    async removeDriver(driverId: string): Promise<void> {
        await redis.del(
            `${DRIVER_LOCATION_KEY}:${driverId}`,
            `${DRIVER_STATUS_KEY}:${driverId}`
        );
    }

    /**
     * Track which ride a driver is currently on (for socket broadcasts)
     */
    async setDriverActiveRide(driverId: string, rideId: string): Promise<void> {
        await redis.set(`${DRIVER_ACTIVE_RIDE_KEY}:${driverId}`, rideId, "EX", 7200);
    }

    async getDriverActiveRide(driverId: string): Promise<string | null> {
        return redis.get(`${DRIVER_ACTIVE_RIDE_KEY}:${driverId}`);
    }

    async removeDriverActiveRide(driverId: string): Promise<void> {
        await redis.del(`${DRIVER_ACTIVE_RIDE_KEY}:${driverId}`);
    }

    /**
     * Find nearby online drivers within a radius (km)
     * Uses Haversine formula since we're storing in hashes
     */
    async findNearbyDrivers(
        lat: number,
        lng: number,
        radiusKm: number,
        excludeDriverIds: string[] = []
    ): Promise<Array<{ driverId: string; location: DriverLocation; distanceKm: number }>> {
        // Get all driver location keys
        const keys = await this.scanKeys(`${DRIVER_LOCATION_KEY}:*`);
        const nearbyDrivers: Array<{ driverId: string; location: DriverLocation; distanceKm: number }> = [];

        for (const key of keys) {
            const driverId = key.replace(`${DRIVER_LOCATION_KEY}:`, "");

            if (excludeDriverIds.includes(driverId)) continue;

            // Check if driver is online
            const status = await this.getDriverStatus(driverId);
            if (status !== "online") continue;

            const location = await this.getDriverLocation(driverId);
            if (!location) continue;

            // Calculate distance
            const distance = this.haversineDistance(lat, lng, location.lat, location.lng);

            if (distance <= radiusKm) {
                nearbyDrivers.push({
                    driverId,
                    location,
                    distanceKm: Math.round(distance * 100) / 100,
                });
            }
        }

        // Sort by distance (closest first)
        return nearbyDrivers.sort((a, b) => a.distanceKm - b.distanceKm);
    }

    // ── Ride Tracking ──

    /**
     * Store ride tracking data in Redis
     */
    async setRideTracking(
        rideId: string,
        data: Record<string, string>
    ): Promise<void> {
        const key = `${RIDE_TRACKING_KEY}:${rideId}`;
        await redis.hset(key, data);
        await redis.expire(key, RIDE_TRACKING_TTL);
    }

    /**
     * Get ride tracking data
     */
    async getRideTracking(rideId: string): Promise<Record<string, string> | null> {
        const key = `${RIDE_TRACKING_KEY}:${rideId}`;
        const data = await redis.hgetall(key);
        return Object.keys(data).length > 0 ? data : null;
    }

    /**
     * Remove ride tracking data
     */
    async removeRideTracking(rideId: string): Promise<void> {
        await redis.del(`${RIDE_TRACKING_KEY}:${rideId}`);
    }

    // ── Ride Broadcasting ──

    /**
     * Track which drivers have been sent a ride broadcast
     */
    async addToBroadcast(rideId: string, driverIds: string[]): Promise<void> {
        if (driverIds.length === 0) return;
        const key = `${RIDE_BROADCAST_KEY}:${rideId}`;
        await redis.sadd(key, ...driverIds);
        await redis.expire(key, RIDE_BROADCAST_TTL);
    }

    /**
     * Get all drivers who received a broadcast for this ride
     */
    async getBroadcastedDrivers(rideId: string): Promise<string[]> {
        return redis.smembers(`${RIDE_BROADCAST_KEY}:${rideId}`);
    }

    /**
     * Clean up broadcast data
     */
    async removeBroadcast(rideId: string): Promise<void> {
        await redis.del(`${RIDE_BROADCAST_KEY}:${rideId}`);
    }

    // ── Helpers ──

    /**
     * Scan for Redis keys matching a pattern
     */
    private async scanKeys(pattern: string): Promise<string[]> {
        const keys: string[] = [];
        let cursor = "0";

        do {
            const [newCursor, foundKeys] = await redis.scan(cursor, "MATCH", pattern, "COUNT", 100);
            cursor = newCursor;
            keys.push(...foundKeys);
        } while (cursor !== "0");

        return keys;
    }

    /**
     * Haversine formula to calculate distance between two coordinates in km
     */
    private haversineDistance(
        lat1: number,
        lng1: number,
        lat2: number,
        lng2: number
    ): number {
        const R = 6371; // Earth's radius in km
        const dLat = this.toRad(lat2 - lat1);
        const dLng = this.toRad(lng2 - lng1);

        const a =
            Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(this.toRad(lat1)) * Math.cos(this.toRad(lat2)) *
            Math.sin(dLng / 2) * Math.sin(dLng / 2);

        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }

    private toRad(deg: number): number {
        return deg * (Math.PI / 180);
    }
}
