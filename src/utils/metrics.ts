import client from "prom-client";
import { Request, Response, NextFunction } from "express";

// ─── Prometheus Registry ────────────────────────────────────────────

export const register = new client.Registry();

// Default metrics (CPU, memory, event loop, etc.)
client.collectDefaultMetrics({ register, prefix: "velo_" });

// ─── Custom Metrics ─────────────────────────────────────────────────

/** Total HTTP requests counter */
export const httpRequestsTotal = new client.Counter({
  name: "velo_http_requests_total",
  help: "Total number of HTTP requests",
  labelNames: ["method", "route", "status_code"],
  registers: [register],
});

/** HTTP request duration histogram */
export const httpRequestDuration = new client.Histogram({
  name: "velo_http_request_duration_seconds",
  help: "HTTP request duration in seconds",
  labelNames: ["method", "route", "status_code"],
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [register],
});

/** Active HTTP connections gauge */
export const httpActiveConnections = new client.Gauge({
  name: "velo_http_active_connections",
  help: "Number of active HTTP connections",
  registers: [register],
});

/** Ride lifecycle counter */
export const rideEventsTotal = new client.Counter({
  name: "velo_ride_events_total",
  help: "Total ride lifecycle events",
  labelNames: ["event"], // requested, accepted, completed, cancelled
  registers: [register],
});

/** Payment counter */
export const paymentEventsTotal = new client.Counter({
  name: "velo_payment_events_total",
  help: "Total payment events",
  labelNames: ["method", "status"], // momo/wallet/cash, success/failed
  registers: [register],
});

/** Auth events counter */
export const authEventsTotal = new client.Counter({
  name: "velo_auth_events_total",
  help: "Total auth events",
  labelNames: ["event"], // otp_requested, otp_verified, otp_failed
  registers: [register],
});

/** Database query duration */
export const dbQueryDuration = new client.Histogram({
  name: "velo_db_query_duration_seconds",
  help: "Database query duration in seconds",
  labelNames: ["operation"], // insert, select, update, delete
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 5],
  registers: [register],
});

/** Notification counter */
export const notificationEventsTotal = new client.Counter({
  name: "velo_notification_events_total",
  help: "Total notifications sent",
  labelNames: ["channel", "status"], // push/sms/whatsapp, success/failed
  registers: [register],
});

/** Upload counter */
export const uploadEventsTotal = new client.Counter({
  name: "velo_upload_events_total",
  help: "Total file upload events",
  labelNames: ["category", "status"], // id-cards/licenses/etc, success/failed
  registers: [register],
});

/** Driver match counter */
export const driverMatchEventsTotal = new client.Counter({
  name: "velo_driver_match_events_total",
  help: "Total driver match events",
  labelNames: ["result"], // found, not_found
  registers: [register],
});

// ─── HTTP Metrics Middleware ────────────────────────────────────────

/**
 * Normalise Express route paths so we don't get cardinality explosion
 * e.g. /api/v1/rides/abc-123 → /api/v1/rides/:id
 */
function normalizeRoute(req: Request): string {
  if (req.route?.path) {
    return `${req.baseUrl}${req.route.path}`;
  }
  // Fallback: strip UUIDs and numeric IDs from path
  return req.path
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ":id")
    .replace(/\/\d+/g, "/:id");
}

export function metricsMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Skip metrics endpoint itself
  if (req.path === "/metrics") return next();

  httpActiveConnections.inc();
  const end = httpRequestDuration.startTimer();

  res.on("finish", () => {
    httpActiveConnections.dec();
    const route = normalizeRoute(req);
    const statusCode = res.statusCode.toString();

    end({ method: req.method, route, status_code: statusCode });
    httpRequestsTotal.inc({ method: req.method, route, status_code: statusCode });
  });

  next();
}
