import axios from "axios";
import { createServiceLogger } from "../utils/logger";

const log = createServiceLogger("PlacesService");

export interface PlacePrediction {
    placeId: string;
    description: string;
    mainText: string;
    secondaryText: string;
}

export interface PlaceDetails {
    placeId: string;
    address: string;
    lat: number;
    lng: number;
}

export interface DistanceResult {
    distanceKm: number;
    durationMin: number;
    distanceText: string;
    durationText: string;
}

const GOOGLE_MAPS_BASE = "https://maps.googleapis.com/maps/api";

export class PlacesService {
    private apiKey: string;

    constructor() {
        this.apiKey = process.env.GOOGLE_MAPS_API_KEY || "";
        if (!this.apiKey) {
            log.warn("GOOGLE_MAPS_API_KEY not set");
        }
    }

    /**
     * Autocomplete place search (for search-as-you-type)
     */
    async autocomplete(
        input: string,
        sessionToken?: string
    ): Promise<PlacePrediction[]> {
        const response = await axios.get(`${GOOGLE_MAPS_BASE}/place/autocomplete/json`, {
            params: {
                input,
                key: this.apiKey,
                components: "country:gh", // Restrict to Ghana
                sessiontoken: sessionToken,
            },
        });

        const predictions = response.data.predictions || [];

        return predictions.map((p: any) => ({
            placeId: p.place_id,
            description: p.description,
            mainText: p.structured_formatting?.main_text || "",
            secondaryText: p.structured_formatting?.secondary_text || "",
        }));
    }

    /**
     * Get place details (coordinates) from a place ID
     */
    async getPlaceDetails(
        placeId: string,
        sessionToken?: string
    ): Promise<PlaceDetails> {
        const response = await axios.get(`${GOOGLE_MAPS_BASE}/place/details/json`, {
            params: {
                place_id: placeId,
                fields: "formatted_address,geometry",
                key: this.apiKey,
                sessiontoken: sessionToken,
            },
        });

        const result = response.data.result;
        if (!result) throw new Error("Place not found");

        return {
            placeId,
            address: result.formatted_address,
            lat: result.geometry.location.lat,
            lng: result.geometry.location.lng,
        };
    }

    /**
     * Get driving distance and duration between two points
     */
    async getDistance(
        originLat: number,
        originLng: number,
        destLat: number,
        destLng: number
    ): Promise<DistanceResult> {
        const response = await axios.get(`${GOOGLE_MAPS_BASE}/distancematrix/json`, {
            params: {
                origins: `${originLat},${originLng}`,
                destinations: `${destLat},${destLng}`,
                mode: "driving",
                key: this.apiKey,
            },
        });

        const element = response.data.rows?.[0]?.elements?.[0];

        if (!element || element.status !== "OK") {
            throw new Error("Could not calculate distance");
        }

        return {
            distanceKm: Math.round((element.distance.value / 1000) * 100) / 100,
            durationMin: Math.round((element.duration.value / 60) * 100) / 100,
            distanceText: element.distance.text,
            durationText: element.duration.text,
        };
    }

    /**
     * Reverse geocode coordinates to an address
     */
    async reverseGeocode(lat: number, lng: number): Promise<string> {
        const response = await axios.get(`${GOOGLE_MAPS_BASE}/geocode/json`, {
            params: {
                latlng: `${lat},${lng}`,
                key: this.apiKey,
            },
        });

        const results = response.data.results;
        if (!results || results.length === 0) {
            throw new Error("No address found for coordinates");
        }

        return results[0].formatted_address;
    }
}
