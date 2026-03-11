import { redis } from "../utils/redis";
import { createServiceLogger } from "../utils/logger";

const log = createServiceLogger("PickupCodeService");

// Redis key patterns
const PICKUP_ATTEMPTS_KEY = (orderId: string) => `pickup:attempts:${orderId}`;

const MAX_VERIFY_ATTEMPTS = 5;
const ATTEMPTS_TTL = 3600; // 1 hour

/**
 * PickupCodeService — Generate & verify 6-char alphanumeric pickup codes.
 *
 * Codes are stored on the Order row itself. Redis is used only for
 * rate-limiting verification attempts to prevent brute-forcing.
 */
export class PickupCodeService {
    // ── Generate ────────────────────────────────────────────────────

    /**
     * Generate a 6-character alphanumeric code (uppercase, no ambiguous chars).
     * Characters: A-Z, 2-9 (no 0/O, 1/I/L to avoid confusion).
     */
    generate(): string {
        const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
        let code = "";
        for (let i = 0; i < 6; i++) {
            code += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return code;
    }

    // ── Verify ──────────────────────────────────────────────────────

    /**
     * Verify a pickup code against the expected code.
     * Uses Redis to rate-limit verification attempts (max 5 per order per hour).
     *
     * @returns `{ valid, attemptsRemaining }` — or throws on rate limit exceeded.
     */
    async verify(
        orderId: string,
        submittedCode: string,
        expectedCode: string
    ): Promise<{ valid: boolean; attemptsRemaining: number }> {
        const key = PICKUP_ATTEMPTS_KEY(orderId);

        // Check attempts count
        const attempts = await redis.get(key);
        const currentAttempts = attempts ? parseInt(attempts, 10) : 0;

        if (currentAttempts >= MAX_VERIFY_ATTEMPTS) {
            log.warn("Pickup code verification rate-limited", { orderId, attempts: currentAttempts });
            throw new Error("Too many verification attempts. Please wait and try again.");
        }

        const valid = submittedCode.toUpperCase().trim() === expectedCode.toUpperCase().trim();

        if (valid) {
            // Success — clean up attempts counter
            await redis.del(key);
            log.info("Pickup code verified successfully", { orderId });
        } else {
            // Increment attempts
            const newAttempts = currentAttempts + 1;
            await redis.set(key, newAttempts.toString(), "EX", ATTEMPTS_TTL);
            log.warn("Invalid pickup code attempt", {
                orderId,
                attempt: newAttempts,
                remaining: MAX_VERIFY_ATTEMPTS - newAttempts,
            });
        }

        return {
            valid,
            attemptsRemaining: valid ? MAX_VERIFY_ATTEMPTS : MAX_VERIFY_ATTEMPTS - (currentAttempts + 1),
        };
    }

    /**
     * Reset verification attempts for an order (admin use).
     */
    async resetAttempts(orderId: string): Promise<void> {
        await redis.del(PICKUP_ATTEMPTS_KEY(orderId));
    }
}
