import { Response } from "express";
import { AuthRequest } from "../middleware/role-middleware";
import { PlacesService } from "../services/places-service";

export class PlacesController {
    private placesService = new PlacesService();

    /**
     * GET /places/autocomplete?input=...&sessionToken=...
     * Search places as user types
     */
    autocomplete = async (req: AuthRequest, res: Response) => {
        try {
            const input = req.query.input as string;
            const sessionToken = req.query.sessionToken as string | undefined;

            if (!input) {
                return res.status(400).json({ message: "input query param is required" });
            }

            const predictions = await this.placesService.autocomplete(input, sessionToken);
            return res.json({ predictions });
        } catch (error: any) {
            console.error("Error in autocomplete:", error);
            return res.status(500).json({ message: "Internal server error" });
        }
    };

    /**
     * GET /places/details/:placeId?sessionToken=...
     * Get place coordinates from place ID
     */
    getPlaceDetails = async (req: AuthRequest, res: Response) => {
        try {
            const placeId = req.params.placeId;
            const sessionToken = req.query.sessionToken as string | undefined;

            const details = await this.placesService.getPlaceDetails(placeId, sessionToken);
            return res.json({ place: details });
        } catch (error: any) {
            console.error("Error getting place details:", error);
            return res.status(400).json({ message: error.message || "Internal server error" });
        }
    };

    /**
     * POST /places/distance
     * Get driving distance and duration between two points
     */
    getDistance = async (req: AuthRequest, res: Response) => {
        try {
            const { originLat, originLng, destLat, destLng } = req.body;

            if (originLat === undefined || originLng === undefined || destLat === undefined || destLng === undefined) {
                return res.status(400).json({ message: "originLat, originLng, destLat, destLng are required" });
            }

            const result = await this.placesService.getDistance(
                Number(originLat),
                Number(originLng),
                Number(destLat),
                Number(destLng)
            );

            return res.json({ distance: result });
        } catch (error: any) {
            console.error("Error getting distance:", error);
            return res.status(400).json({ message: error.message || "Internal server error" });
        }
    };

    /**
     * POST /places/reverse-geocode
     * Get address from coordinates
     */
    reverseGeocode = async (req: AuthRequest, res: Response) => {
        try {
            const { lat, lng } = req.body;

            if (lat === undefined || lng === undefined) {
                return res.status(400).json({ message: "lat and lng are required" });
            }

            const address = await this.placesService.reverseGeocode(Number(lat), Number(lng));
            return res.json({ address });
        } catch (error: any) {
            console.error("Error reverse geocoding:", error);
            return res.status(400).json({ message: error.message || "Internal server error" });
        }
    };
}
