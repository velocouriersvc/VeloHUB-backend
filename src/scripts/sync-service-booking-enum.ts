import { AppDataSource } from "../db/data-source";
import { ServiceBookingStatus } from "../models/service-booking";
import logger from "../utils/logger";

/**
 * Ensure every ServiceBookingStatus value exists in the Postgres enum backing
 * service_bookings.status. TypeORM `synchronize` does not reliably add new
 * values to an existing enum (round-8 added expired / customer_cancelled /
 * provider_cancelled). Idempotent via ADD VALUE IF NOT EXISTS.
 */
export async function syncServiceBookingStatusEnum(alreadyInitialised = false): Promise<void> {
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
            WHERE c.relname = 'service_bookings' AND a.attname = 'status' AND n.nspname = 'public'
            LIMIT 1
        `);
        const enumName = rows?.[0]?.enum_name;
        if (!enumName) {
            logger.warn("service booking status enum sync skipped: enum type not found");
            return;
        }

        for (const value of Object.values(ServiceBookingStatus)) {
            // Values come from our own enum (trusted, lowercase a-z/_), not user input.
            await AppDataSource.query(`ALTER TYPE "${enumName}" ADD VALUE IF NOT EXISTS '${value}'`);
        }
        logger.info(`service booking status enum "${enumName}" synced`);
    } catch (err) {
        logger.warn("service booking status enum sync failed (non-fatal)", { error: (err as Error).message });
    } finally {
        if (!alreadyInitialised) {
            await AppDataSource.destroy();
        }
    }
}

if (require.main === module) {
    syncServiceBookingStatusEnum(false)
        .then(() => console.log("Done - service booking status enum synced."))
        .catch(console.error);
}
