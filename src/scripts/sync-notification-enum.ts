import { AppDataSource } from "../db/data-source";
import { NotificationType } from "../models/notification";
import logger from "../utils/logger";

/**
 * Ensure every NotificationType value exists in the Postgres enum backing
 * notifications.type.
 *
 * Why this exists: this environment applies schema via TypeORM `synchronize`,
 * which does NOT reliably add new values to an existing Postgres enum, and
 * migrations are not auto-run here. A missing value (e.g. "profile_created",
 * "welcome") made notification inserts throw, which previously surfaced as a
 * 500 during driver/merchant/buyer profile setup.
 *
 * Idempotent: `ADD VALUE IF NOT EXISTS` is a no-op when the value is present.
 * The actual enum type name is resolved from the column so it works regardless
 * of how the type was named historically.
 */
export async function syncNotificationTypeEnum(alreadyInitialised = false): Promise<void> {
    if (!alreadyInitialised) {
        await AppDataSource.initialize();
    }
    try {
        const rows: Array<{ enum_name: string }> = await AppDataSource.query(`
            SELECT t.typname AS enum_name
            FROM pg_type t
            JOIN pg_attribute a ON a.atttypid = t.oid
            JOIN pg_class c ON c.oid = a.attrelid
            JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE c.relname = 'notifications' AND a.attname = 'type' AND n.nspname = 'public'
            LIMIT 1
        `);
        const enumName = rows?.[0]?.enum_name;
        if (!enumName) {
            logger.warn("notification_type_enum sync skipped: enum type not found");
            return;
        }

        let added = 0;
        for (const value of Object.values(NotificationType)) {
            // Values come from our own enum (trusted, lowercase a-z/_), not user input.
            await AppDataSource.query(`ALTER TYPE "${enumName}" ADD VALUE IF NOT EXISTS '${value}'`);
            added++;
        }
        logger.info(`notification enum "${enumName}" synced (${added} values ensured)`);
    } catch (err) {
        // Non-fatal: notifications are best-effort and core flows already tolerate failures.
        logger.warn("notification enum sync failed (non-fatal)", { error: (err as Error).message });
    } finally {
        if (!alreadyInitialised) {
            await AppDataSource.destroy();
        }
    }
}

if (require.main === module) {
    syncNotificationTypeEnum(false)
        .then(() => console.log("Done - notification enum synced."))
        .catch(console.error);
}
