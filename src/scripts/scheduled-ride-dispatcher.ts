import logger from "../utils/logger";
import { ScheduledRideService } from "../services/scheduled-ride-service";

// How often to check for scheduled rides that are due to be dispatched.
const TICK_MS = 60 * 1000;

let running = false;

/**
 * Poll for due scheduled rides and convert them into real, broadcast rides. Called
 * once on boot; each tick is guarded so a slow tick never overlaps the next.
 */
export function startScheduledRideDispatcher(): void {
    const service = new ScheduledRideService();

    const tick = async () => {
        if (running) return;
        running = true;
        try {
            const count = await service.dispatchDue();
            if (count > 0) logger.info("Scheduled rides dispatched", { count });
        } catch (err) {
            logger.warn("Scheduled ride dispatch tick failed", { error: (err as Error).message });
        } finally {
            running = false;
        }
    };

    setInterval(tick, TICK_MS);
    logger.info("Scheduled ride dispatcher started", { tickMs: TICK_MS });
}
