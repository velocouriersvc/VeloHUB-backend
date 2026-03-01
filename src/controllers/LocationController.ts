import { Response } from "express";
import { AuthRequest } from "../middleware/role-middleware";
import { LocationService } from "../services/location-service";

export class LocationController {
    private locationService = new LocationService();

    /**
     * POST /locations
     * Save a new location
     */
    saveLocation = async (req: AuthRequest, res: Response) => {
        try {
            const userId = req.user?.id;
            if (!userId) return res.status(401).json({ message: "User ID required" });

            const { label, address, lat, lng } = req.body;

            if (!label || !address || lat === undefined || lng === undefined) {
                return res.status(400).json({ message: "label, address, lat, lng are required" });
            }

            const location = await this.locationService.saveLocation(userId, label, address, Number(lat), Number(lng));
            return res.status(201).json({ location });
        } catch (error: any) {
            console.error("Error saving location:", error);
            return res.status(500).json({ message: "Internal server error" });
        }
    };

    /**
     * GET /locations
     * Get user's saved locations
     */
    getLocations = async (req: AuthRequest, res: Response) => {
        try {
            const userId = req.user?.id;
            if (!userId) return res.status(401).json({ message: "User ID required" });

            const locations = await this.locationService.getUserLocations(userId);
            return res.json({ locations });
        } catch (error: any) {
            console.error("Error getting locations:", error);
            return res.status(500).json({ message: "Internal server error" });
        }
    };

    /**
     * PUT /locations/:id
     * Update a saved location
     */
    updateLocation = async (req: AuthRequest, res: Response) => {
        try {
            const userId = req.user?.id;
            if (!userId) return res.status(401).json({ message: "User ID required" });

            const locationId = req.params.id;
            const { label, address, lat, lng } = req.body;

            const location = await this.locationService.updateLocation(locationId, userId, {
                label,
                address,
                lat: lat !== undefined ? Number(lat) : undefined,
                lng: lng !== undefined ? Number(lng) : undefined,
            });

            return res.json({ location });
        } catch (error: any) {
            console.error("Error updating location:", error);
            return res.status(400).json({ message: error.message || "Internal server error" });
        }
    };

    /**
     * DELETE /locations/:id
     * Delete a saved location
     */
    deleteLocation = async (req: AuthRequest, res: Response) => {
        try {
            const userId = req.user?.id;
            if (!userId) return res.status(401).json({ message: "User ID required" });

            await this.locationService.deleteLocation(req.params.id, userId);
            return res.json({ message: "Location deleted" });
        } catch (error: any) {
            console.error("Error deleting location:", error);
            return res.status(400).json({ message: error.message || "Internal server error" });
        }
    };
}
