import type { Express } from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";

/**
 * Edge hardening for the API.
 *
 * Kept in one module so the exact configuration can be exercised by tests -
 * the settings that matter here are the exceptions, and each one is load
 * bearing: get the CORP policy wrong and every product photo stops loading,
 * get the CORS callback wrong and the mobile apps stop talking to the API.
 */

/** First-party browser origins. Overridable per environment. */
export function allowedOrigins(): string[] {
    return (
        process.env.CORS_ALLOWED_ORIGINS ||
        "https://admin.velocouriersvc.com,https://velocouriersvc.com,https://www.velocouriersvc.com"
    ).split(",").map(o => o.trim()).filter(Boolean);
}

/**
 * Paths the global limiter must never drop: webhook delivery (the provider
 * retries and then gives up), health probes, and the Prometheus scrape.
 */
export function isExemptFromRateLimit(path: string): boolean {
    return path.startsWith("/api/v1/payments/")
        || path.startsWith("/api/v1/identity/webhook")
        || path === "/metrics"
        || path.startsWith("/health");
}

/**
 * Sending an OTP costs money and lands on someone's phone. The x-api-key gate
 * does not help, because that key ships inside the mobile app, so anyone who
 * pulls the binary apart can spam these endpoints.
 *
 * Counts per pod, and the API runs two replicas, so the real ceiling is about
 * double this.
 */
export const otpLimiter = rateLimit({
    windowMs: 15 * 60_000,
    limit: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: "Too many verification attempts. Please wait a few minutes and try again." },
});

/** Auth paths that either cost money to call or are worth guessing at. */
export const RATE_LIMITED_AUTH_PATHS = [
    "/api/v1/auth/request-otp",
    "/api/v1/auth/verify-otp",
    "/api/v1/auth/forgot-password",
    "/api/v1/auth/reset-password-phone",
    "/api/v1/auth/login",
];

export function applySecurityMiddleware(app: Express): void {
    // Behind the nginx reverse proxy (api.velocouriersvc.com -> NodePort 30080).
    // Trusting exactly one hop lets the rate limiters and logs see the real
    // client IP from X-Forwarded-For, without letting a client forge it by
    // sending its own header - which "trust proxy: true" would allow.
    app.set("trust proxy", 1);

    app.use(helmet({
        // This is a JSON API. The only HTML it serves is Swagger UI, which needs
        // inline styles and scripts, so a CSP would break that page while
        // protecting nothing else.
        contentSecurityPolicy: false,
        // Product photos and compliance documents are streamed from MinIO through
        // this API and loaded by the admin dashboard on a different origin, so
        // helmet's default same-origin policy would break every image.
        crossOriginResourcePolicy: { policy: "cross-origin" },
    }));

    // Requests with no Origin header are allowed: the mobile apps and the
    // Stripe/Paystack webhooks send none, and rejecting them would take the
    // apps down while doing nothing for browser security. An unknown origin
    // simply gets no CORS headers back (the browser then blocks it) rather
    // than a 500.
    const origins = allowedOrigins();
    app.use(cors({
        origin: (origin, callback) => callback(null, !origin || origins.includes(origin)),
        credentials: true,
    }));

    // Deliberately generous: the point is to stop runaway abuse, not to police
    // normal use.
    app.use(rateLimit({
        windowMs: 60_000,
        limit: 600,
        standardHeaders: true,
        legacyHeaders: false,
        skip: (req) => isExemptFromRateLimit(req.path),
    }));
}
