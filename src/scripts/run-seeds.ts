import logger from "../utils/logger";
import { seedPlatformSettings } from "./seed-platform-settings";
import { seedVehiclePricing } from "./seed-vehicle-pricing";
import { seedProductCategories } from "./seed-product-categories";
import { syncNotificationTypeEnum } from "./sync-notification-enum";
import { syncServiceBookingStatusEnum } from "./sync-service-booking-enum";
import { syncOrderStatusEnum } from "./sync-order-status-enum";
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
    // Each seed is isolated: one failure must never starve the seeds after it
    // (a platform-settings varchar overflow silently blocked the price-book seed
    // in production for a full release).
    const seeds: Array<[string, () => Promise<unknown>]> = [
        // Platform settings first (vehicle pricing references the same countries)
        ["platform-settings", () => seedPlatformSettings(true)],
        ["vehicle-pricing", () => seedVehiclePricing(true)],
        ["product-categories", () => seedProductCategories(true)],
        // Ensure the notifications enum has every value (fixes setup 500s caused by
        // missing enum values like "profile_created"/"welcome" on synchronize-only DBs).
        ["notification-enum", () => syncNotificationTypeEnum(true)],
        ["service-booking-enum", () => syncServiceBookingStatusEnum(true)],
        ["order-status-enum", () => syncOrderStatusEnum(true)],
    ];
    // Placeholder images for blank products are OPT-IN only. Merchants list products
    // with (or without) their own images, and new listings must never be switched to
    // a generic image. Enable via ENABLE_PRODUCT_IMAGE_BACKFILL=true if ever needed.
    if (process.env.ENABLE_PRODUCT_IMAGE_BACKFILL === "true") {
        seeds.push(["product-image-backfill", () => backfillProductImages(true)]);
    }

    for (const [name, run] of seeds) {
        try {
            await run();
        } catch (err) {
            // Non-fatal - the server can still run without this seed
            logger.warn(`Seed script failed: ${name} (data may need manual seeding)`, {
                error: (err as Error).message,
            });
        }
    }
    logger.info("Seed scripts finished");
}
