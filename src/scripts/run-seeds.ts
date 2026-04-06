import logger from "../utils/logger";
import { seedPlatformSettings } from "./seed-platform-settings";
import { seedVehiclePricing } from "./seed-vehicle-pricing";

/**
 * Run all essential seed scripts once on server boot.
 *
 * Every seed function uses "find-or-create" logic, so calling this
 * on every startup is safe — existing rows are simply skipped.
 *
 * Call this **after** AppDataSource.initialize() has resolved and
 * pass `alreadyInitialised = true` so seeds don't try to re-connect.
 */
export async function runSeeds(): Promise<void> {
    try {
        // Platform settings first (vehicle pricing references the same countries)
        await seedPlatformSettings(true);
        await seedVehiclePricing(true);

        logger.info("All seed scripts completed");
    } catch (err) {
        // Non-fatal — the server can still run without seeds
        logger.warn("Seed scripts failed (data may need manual seeding)", {
            error: (err as Error).message,
        });
    }
}
