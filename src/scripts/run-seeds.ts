import logger from "../utils/logger";
import { seedPlatformSettings } from "./seed-platform-settings";
import { seedVehiclePricing } from "./seed-vehicle-pricing";
import { seedProductCategories } from "./seed-product-categories";
import { syncNotificationTypeEnum } from "./sync-notification-enum";
import { backfillProductImages } from "./backfill-product-images";

/**
 * Run all essential seed scripts once on server boot.
 *
 * Every seed function uses "find-or-create" logic, so calling this
 * on every startup is safe - existing rows are simply skipped.
 *
 * Call this **after** AppDataSource.initialize() has resolved and
 * pass `alreadyInitialised = true` so seeds don't try to re-connect.
 */
export async function runSeeds(): Promise<void> {
    try {
        // Platform settings first (vehicle pricing references the same countries)
        await seedPlatformSettings(true);
        await seedVehiclePricing(true);
        await seedProductCategories(true);
        // Ensure the notifications enum has every value (fixes setup 500s caused by
        // missing enum values like "profile_created"/"welcome" on synchronize-only DBs).
        await syncNotificationTypeEnum(true);

        // Placeholder images for blank products are now OPT-IN only. Merchants list
        // products with (or without) their own images, and new listings must never be
        // switched to a generic image. Run it once manually if ever needed by setting
        // ENABLE_PRODUCT_IMAGE_BACKFILL=true (or `npm run seed:product-images`).
        if (process.env.ENABLE_PRODUCT_IMAGE_BACKFILL === "true") {
            await backfillProductImages(true);
        }

        logger.info("All seed scripts completed");
    } catch (err) {
        // Non-fatal - the server can still run without seeds
        logger.warn("Seed scripts failed (data may need manual seeding)", {
            error: (err as Error).message,
        });
    }
}
