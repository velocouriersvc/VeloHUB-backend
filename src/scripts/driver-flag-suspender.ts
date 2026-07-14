import logger from "../utils/logger";
import { AdminService } from "../services/admin-service";

// How often to check flagged drivers, and the grace window before suspension.
const TICK_MS = 10 * 60 * 1000; // 10 minutes
const GRACE_HOURS = 6;

let running = false;

/**
 * Suspend drivers whose flag has been open longer than GRACE_HOURS without an
 * admin clearing it. Started once on boot; ticks are guarded against overlap.
 */
export function startDriverFlagSuspender(): void {
    const service = new AdminService();

    const tick = async () => {
        if (running) return;
        running = true;
        try {
            const count = await service.suspendExpiredFlaggedDrivers(GRACE_HOURS);
            if (count > 0) logger.info("Flagged drivers auto-suspended", { count });
        } catch (err) {
            logger.warn("Driver flag suspender tick failed", { error: (err as Error).message });
        } finally {
            running = false;
        }
    };

    setInterval(tick, TICK_MS);
    logger.info("Driver flag suspender started", { tickMs: TICK_MS, graceHours: GRACE_HOURS });
}
