import { AppDataSource } from "../db/data-source";
import { OrderStatus } from "../models/order";
import logger from "../utils/logger";

/**
 * Ensure every OrderStatus value exists in the Postgres enum backing
 * orders.status. TypeORM `synchronize` does not reliably add new values to an
 * existing enum (round-10 added awaiting_payment). Idempotent via
 * ADD VALUE IF NOT EXISTS.
 */
export async function syncOrderStatusEnum(alreadyInitialised = false): Promise<void> {
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
            WHERE c.relname = 'orders' AND a.attname = 'status' AND n.nspname = 'public'
            LIMIT 1
        `);
        const enumName = rows?.[0]?.enum_name;
        if (!enumName) {
            logger.warn("order status enum sync skipped: enum type not found");
            return;
        }

        for (const value of Object.values(OrderStatus)) {
            // Values come from our own enum (trusted, lowercase a-z/_), not user input.
            await AppDataSource.query(`ALTER TYPE "${enumName}" ADD VALUE IF NOT EXISTS '${value}'`);
        }
        logger.info(`order status enum "${enumName}" synced`);
    } catch (err) {
        logger.warn("order status enum sync failed (non-fatal)", { error: (err as Error).message });
    } finally {
        if (!alreadyInitialised) {
            await AppDataSource.destroy();
        }
    }
}

if (require.main === module) {
    syncOrderStatusEnum(false)
        .then(() => console.log("Done - order status enum synced."))
        .catch(console.error);
}
