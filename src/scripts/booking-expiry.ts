import logger from "../utils/logger";
import { ServiceBookingService, EXPIRY_LEAD_HOURS } from "../services/service-booking-service";

// Sweep cadence for expiring unaccepted service bookings.
const TICK_MS = 5 * 60 * 1000;

let running = false;

/**
 * Expire service bookings still "requested" within 2 hours of their start time:
 * full refund to the customer, notify both sides. Started once on boot; ticks
 * are guarded against overlap.
 */
export function startBookingExpiry(): void {
    const service = new ServiceBookingService();

    const tick = async () => {
        if (running) return;
        running = true;
        try {
            const count = await service.expireStaleBookings(EXPIRY_LEAD_HOURS);
            if (count > 0) logger.info("Stale service bookings expired", { count });

            // Abandoned checkouts: cancel unpaid bookings so they stop holding the
            // provider's slot. No refund - nothing was ever captured.
            const reaped = await service.reapUnpaidBookings();
            if (reaped > 0) logger.info("Unpaid service bookings reaped", { count: reaped });
        } catch (err) {
            logger.warn("Booking expiry tick failed", { error: (err as Error).message });
        } finally {
            running = false;
        }
    };

    setInterval(tick, TICK_MS);
    logger.info("Service booking expiry job started", { tickMs: TICK_MS, leadHours: EXPIRY_LEAD_HOURS });
}
