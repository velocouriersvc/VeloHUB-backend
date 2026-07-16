import logger from "../utils/logger";
import { OrderService } from "../services/order-service";

// How often to sweep for stale unaccepted orders.
const TICK_MS = 60 * 1000;
const MAX_AGE_MIN = 10;

let running = false;

/**
 * Auto-cancel orders the merchant never accepted within MAX_AGE_MIN minutes,
 * refunding the customer and logging a merchant penalty. Started once on boot;
 * each tick is guarded so a slow tick never overlaps the next.
 */
export function startOrderAutoCancel(): void {
    const service = new OrderService();

    const tick = async () => {
        if (running) return;
        running = true;
        try {
            const count = await service.autoCancelStaleOrders(MAX_AGE_MIN);
            if (count > 0) logger.info("Stale orders auto-cancelled", { count });
            // Also reap online orders whose payment was never completed.
            const reaped = await service.reapUnpaidOrders(MAX_AGE_MIN);
            if (reaped > 0) logger.info("Unpaid orders reaped", { reaped });
        } catch (err) {
            logger.warn("Order auto-cancel tick failed", { error: (err as Error).message });
        } finally {
            running = false;
        }
    };

    setInterval(tick, TICK_MS);
    logger.info("Order auto-cancel job started", { tickMs: TICK_MS, maxAgeMin: MAX_AGE_MIN });
}
