import axios from "axios";
import { createServiceLogger } from "../utils/logger";
import { currencyForCountry } from "../utils/currency";

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
    country: string;   // ISO2, e.g. "US" - drives the market + currency
    city: string;
    currency: string;  // e.g. "USD"
}

export interface ReverseGeocodeResult {
    address: string;
    country: string;
    city: string;
    currency: string;
}

interface GoogleAddressComponent {
    long_name: string;
    short_name: string;
    types: string[];
}

/** Pull the ISO2 country and a best-effort city from Google address_components. */
function extractCountryCity(components: GoogleAddressComponent[] = []): { country: string; city: string } {
    const find = (type: string) => components.find((c) => c.types.includes(type));
    const country = find("country")?.short_name || "";
    const city =
        find("locality")?.long_name ||
        find("postal_town")?.long_name ||
        find("administrative_area_level_2")?.long_name ||
        find("administrative_area_level_1")?.long_name ||
        "";
    return { country, city };
}

export interface DistanceResult {
    distanceKm: number;
    durationMin: number;
    distanceText: string;
    durationText: string;
}

interface GooglePrediction {
    place_id: string;
    description: string;
    structured_formatting?: { main_text?: string; secondary_text?: string };
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
                // Worldwide address search (no country restriction). Google biases results to the
                // caller's region by default, so nearby matches still rank first.
                sessiontoken: sessionToken,
            },
        });

        const predictions = response.data.predictions || [];

        return predictions.map((p: GooglePrediction) => ({
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
                fields: "formatted_address,geometry,address_components",
                key: this.apiKey,
                sessiontoken: sessionToken,
            },
        });

        const result = response.data.result;
        if (!result) throw new Error("Place not found");

        const { country, city } = extractCountryCity(result.address_components);
        return {
            placeId,
            address: result.formatted_address,
            lat: result.geometry.location.lat,
            lng: result.geometry.location.lng,
            country,
            city,
            currency: currencyForCountry(country),
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
    async reverseGeocode(lat: number, lng: number): Promise<ReverseGeocodeResult> {
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

        const { country, city } = extractCountryCity(results[0].address_components);
        return {
            address: results[0].formatted_address,
            country,
            city,
            currency: currencyForCountry(country),
        };
    }
}
