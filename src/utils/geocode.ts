import axios from "axios";
import { createServiceLogger } from "./logger";

const log = createServiceLogger("Geocode");

const GEOCODE_URL = "https://maps.googleapis.com/maps/api/geocode/json";

/**
 * Turn a free-text address into coordinates via the Google Geocoding API.
 * Returns null on any failure (missing key, no result, network error) so callers
 * can degrade gracefully instead of failing the request they are serving.
 */
export async function geocodeAddress(
    query: string,
    country?: string | null,
    apiKey = process.env.GOOGLE_MAPS_API_KEY
): Promise<{ lat: number; lng: number } | null> {
    if (!apiKey || !query?.trim()) return null;
    try {
        const resp = await axios.get(GEOCODE_URL, {
            params: {
                address: query,
                key: apiKey,
                ...(country ? { region: country.toLowerCase() } : {}),
            },
            timeout: 10000,
        });

        const location = resp.data?.status === "OK"
            ? resp.data.results?.[0]?.geometry?.location
            : null;
        if (location) return { lat: location.lat, lng: location.lng };

        log.warn("Geocode returned no result", { query, status: resp.data?.status });
        return null;
    } catch (err) {
        log.error("Geocode request failed", { query, error: (err as Error).message });
        return null;
    }
}
