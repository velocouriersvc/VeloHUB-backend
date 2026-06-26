import "dotenv/config";
import axios from "axios";
import { IsNull } from "typeorm";
import { AppDataSource } from "../db/data-source";
import { MerchantProfile } from "../models/merchant-profile";
import { createServiceLogger } from "../utils/logger";

const log = createServiceLogger("BackfillMerchantLocations");

/**
 * Backfill merchant_profiles.latitude/longitude for existing merchants whose
 * coordinates are null (they signed up before the app captured map coordinates).
 *
 * Without coordinates, delivery-fee calculation fails and the local-radius filter
 * hides the merchant entirely. This script geocodes each merchant's stored
 * `address` (+ region) via the Google Maps Geocoding API and saves the result.
 *
 * Usage:
 *   ts-node src/scripts/backfill-merchant-locations.ts             # apply
 *   ts-node src/scripts/backfill-merchant-locations.ts --dry-run   # preview only
 *   ts-node src/scripts/backfill-merchant-locations.ts --limit=50  # cap how many
 *
 * Safe to re-run: only rows still missing coordinates are processed.
 */

const GEOCODE_URL = "https://maps.googleapis.com/maps/api/geocode/json";
const REQUEST_DELAY_MS = 120; // ~8 req/s - stays well under Google's QPS limits

function arg(name: string): string | undefined {
    const hit = process.argv.find((a) => a.startsWith(`--${name}`));
    if (!hit) return undefined;
    const [, value] = hit.split("=");
    return value ?? "true";
}

async function geocode(
    apiKey: string,
    query: string,
    country?: string | null
): Promise<{ lat: number; lng: number } | null> {
    try {
        const resp = await axios.get(GEOCODE_URL, {
            params: {
                address: query,
                key: apiKey,
                ...(country ? { region: country.toLowerCase() } : {}),
            },
            timeout: 10000,
        });

        if (resp.data?.status === "OK" && resp.data.results?.[0]?.geometry?.location) {
            const { lat, lng } = resp.data.results[0].geometry.location;
            return { lat, lng };
        }
        log.warn("Geocode returned no result", { query, status: resp.data?.status });
        return null;
    } catch (err) {
        log.error("Geocode request failed", { query, error: (err as Error).message });
        return null;
    }
}

export async function backfillMerchantLocations(alreadyInitialised = false) {
    const dryRun = Boolean(arg("dry-run"));
    const limit = arg("limit") ? parseInt(arg("limit") as string) : undefined;

    const apiKey = process.env.GOOGLE_MAPS_API_KEY || "";
    if (!apiKey) {
        throw new Error("GOOGLE_MAPS_API_KEY is not set - cannot geocode.");
    }

    if (!alreadyInitialised) {
        await AppDataSource.initialize();
    }

    const repo = AppDataSource.getRepository(MerchantProfile);

    // Merchants missing either coordinate.
    const missing = await repo.find({
        where: [{ latitude: IsNull() }, { longitude: IsNull() }],
        relations: { user: true },
        ...(limit ? { take: limit } : {}),
    });

    log.info(`Found ${missing.length} merchant(s) missing coordinates${dryRun ? " (dry-run)" : ""}`);

    let updated = 0;
    let skipped = 0;

    for (const merchant of missing) {
        const parts = [merchant.address, merchant.region].filter(Boolean);
        const query = parts.join(", ").trim();
        const country = (merchant as any).user?.country || null;

        if (!query) {
            log.warn("Skipping merchant with no address to geocode", {
                userId: merchant.userId,
                businessName: merchant.businessName,
            });
            skipped++;
            continue;
        }

        const coords = await geocode(apiKey, query, country);
        await new Promise((r) => setTimeout(r, REQUEST_DELAY_MS));

        if (!coords) {
            skipped++;
            continue;
        }

        log.info(`${dryRun ? "[dry-run] would set" : "Set"} ${merchant.businessName} → ${coords.lat}, ${coords.lng}`, {
            userId: merchant.userId,
            query,
        });

        if (!dryRun) {
            merchant.latitude = coords.lat;
            merchant.longitude = coords.lng;
            await repo.save(merchant);
        }
        updated++;
    }

    log.info(`Backfill complete: ${updated} ${dryRun ? "to update" : "updated"}, ${skipped} skipped, ${missing.length} total`);

    if (!alreadyInitialised) {
        await AppDataSource.destroy();
    }

    return { total: missing.length, updated, skipped };
}

if (require.main === module) {
    backfillMerchantLocations(false)
        .then(() => {
            console.log("Done - merchant location backfill finished.");
            process.exit(0);
        })
        .catch((err) => {
            console.error("Backfill failed:", err);
            process.exit(1);
        });
}
