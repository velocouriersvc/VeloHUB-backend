import { AppDataSource } from "../db/data-source";
import { SavedLocation } from "../models/saved-location";

export class LocationService {
    private locationRepo = AppDataSource.getRepository(SavedLocation);

    /**
     * Save a location for a user (e.g., Home, Work, Gym)
     */
    async saveLocation(
        userId: string,
        label: string,
        address: string,
        lat: number,
        lng: number
    ): Promise<SavedLocation> {
        const location = this.locationRepo.create({
            userId,
            label,
            address,
            lat,
            lng,
        });

        return this.locationRepo.save(location);
    }

    /**
     * Get all saved locations for a user
     */
    async getUserLocations(userId: string): Promise<SavedLocation[]> {
        return this.locationRepo.find({
            where: { userId },
            order: { createdAt: "DESC" },
        });
    }

    /**
     * Update a saved location
     */
    async updateLocation(
        locationId: string,
        userId: string,
        updates: Partial<Pick<SavedLocation, "label" | "address" | "lat" | "lng">>
    ): Promise<SavedLocation> {
        const location = await this.locationRepo.findOne({
            where: { id: locationId, userId },
        });

        if (!location) throw new Error("Location not found");

        Object.assign(location, updates);
        return this.locationRepo.save(location);
    }

    /**
     * Delete a saved location
     */
    async deleteLocation(locationId: string, userId: string): Promise<void> {
        const result = await this.locationRepo.delete({ id: locationId, userId });
        if (result.affected === 0) throw new Error("Location not found");
    }
}
