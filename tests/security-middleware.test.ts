import express from "express";
import request from "supertest";
import {
    applySecurityMiddleware,
    isExemptFromRateLimit,
    allowedOrigins,
    otpLimiter,
    RATE_LIMITED_AUTH_PATHS,
} from "../src/middleware/security-middleware";

/**
 * These pin the exceptions in the security config. Each one of them, if it
 * regressed, would break production rather than merely weaken it - so they are
 * asserted against the real middleware rather than reviewed by eye.
 */
function buildApp() {
    const app = express();
    applySecurityMiddleware(app);
    app.get("/api/v1/anything", (_req, res) => { res.json({ ok: true }); });
    app.post("/api/v1/auth/request-otp", otpLimiter, (_req, res) => { res.json({ ok: true }); });
    return app;
}

describe("CORS allowlist", () => {
    it("allows requests with no Origin header (the mobile apps and webhooks)", async () => {
        const res = await request(buildApp()).get("/api/v1/anything");
        expect(res.status).toBe(200);
    });

    it("returns CORS headers for the admin dashboard origin", async () => {
        const res = await request(buildApp())
            .get("/api/v1/anything")
            .set("Origin", "https://admin.velocouriersvc.com");
        expect(res.headers["access-control-allow-origin"]).toBe("https://admin.velocouriersvc.com");
    });

    it("sends no CORS headers to an unknown origin, but does not 500", async () => {
        const res = await request(buildApp())
            .get("/api/v1/anything")
            .set("Origin", "https://evil.example.com");
        expect(res.headers["access-control-allow-origin"]).toBeUndefined();
        expect(res.status).toBe(200);
    });

    it("is overridable per environment", () => {
        const prev = process.env.CORS_ALLOWED_ORIGINS;
        process.env.CORS_ALLOWED_ORIGINS = "https://a.test, https://b.test";
        expect(allowedOrigins()).toEqual(["https://a.test", "https://b.test"]);
        process.env.CORS_ALLOWED_ORIGINS = prev;
    });
});

describe("helmet headers", () => {
    it("allows images to be loaded cross-origin by the admin dashboard", async () => {
        const res = await request(buildApp()).get("/api/v1/anything");
        expect(res.headers["cross-origin-resource-policy"]).toBe("cross-origin");
    });

    it("sets HSTS and blocks MIME sniffing", async () => {
        const res = await request(buildApp()).get("/api/v1/anything");
        expect(res.headers["strict-transport-security"]).toContain("max-age=");
        expect(res.headers["x-content-type-options"]).toBe("nosniff");
    });

    it("stops advertising Express", async () => {
        const res = await request(buildApp()).get("/api/v1/anything");
        expect(res.headers["x-powered-by"]).toBeUndefined();
    });
});

describe("rate limit exemptions", () => {
    it("never throttles webhook delivery, health probes or the metrics scrape", () => {
        for (const p of [
            "/api/v1/payments/stripe-webhook",
            "/api/v1/payments/webhook",
            "/api/v1/identity/webhook",
            "/metrics",
            "/health",
        ]) {
            expect(isExemptFromRateLimit(p)).toBe(true);
        }
    });

    it("throttles ordinary API traffic", () => {
        for (const p of ["/api/v1/auth/request-otp", "/api/v1/orders", "/api/v1/rides"]) {
            expect(isExemptFromRateLimit(p)).toBe(false);
        }
    });
});

describe("OTP limiter", () => {
    it("covers every auth path that costs money or is guessable", () => {
        expect(RATE_LIMITED_AUTH_PATHS).toEqual(expect.arrayContaining([
            "/api/v1/auth/request-otp",
            "/api/v1/auth/verify-otp",
            "/api/v1/auth/forgot-password",
            "/api/v1/auth/reset-password-phone",
            "/api/v1/auth/login",
        ]));
    });

    it("blocks the 11th OTP request in the window", async () => {
        const app = buildApp();
        for (let i = 0; i < 10; i++) {
            const ok = await request(app).post("/api/v1/auth/request-otp");
            expect(ok.status).toBe(200);
        }
        const blocked = await request(app).post("/api/v1/auth/request-otp");
        expect(blocked.status).toBe(429);
        expect(blocked.body.message).toMatch(/Too many verification attempts/);
    });
});
