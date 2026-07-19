import logger from "../utils/logger";
import { OrderService } from "../services/order-service";
import { RideService } from "../services/ride-service";

// How often to sweep for stale unaccepted orders.
const TICK_MS = 60 * 1000;
const MAX_AGE_MIN = 10;
const UNPAID_RIDE_MAX_AGE_MIN = 15;

let running = false;

/**
 * Auto-cancel orders the merchant never accepted within MAX_AGE_MIN minutes,
 * refunding the customer and logging a merchant penalty. Started once on boot;
 * each tick is guarded so a slow tick never overlaps the next.
 */
export function startOrderAutoCancel(): void {
    const service = new OrderService();
    const rideService = new RideService();

    const tick = async () => {
        if (running) return;
        running = true;
        try {
            const count = await service.autoCancelStaleOrders(MAX_AGE_MIN);
            if (count > 0) logger.info("Stale orders auto-cancelled", { count });
            // Also reap online orders whose payment was never completed.
            const reaped = await service.reapUnpaidOrders(MAX_AGE_MIN);
            if (reaped > 0) logger.info("Unpaid orders reaped", { reaped });
            // Prepaid rides abandoned at the payment sheet (no driver was notified).
            const rides = await rideService.reapUnpaidRides(UNPAID_RIDE_MAX_AGE_MIN);
            if (rides > 0) logger.info("Unpaid rides reaped", { rides });
        } catch (err) {
            logger.warn("Order auto-cancel tick failed", { error: (err as Error).message });
        } finally {
            running = false;
        }
    };

    setInterval(tick, TICK_MS);
    logger.info("Order auto-cancel job started", { tickMs: TICK_MS, maxAgeMin: MAX_AGE_MIN });
}
