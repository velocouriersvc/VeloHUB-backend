import { Router, Request, Response } from "express";
import { AppDataSource } from "../db/data-source";
import { redis } from "../utils/redis";

const router = Router();

router.get("/health/counts", async (req, res) => {
    try {
        const tables = [
            "users", "user_profiles", "merchant_profiles", "driver_profiles", "buyer_profiles",
            "audit_logs", "orders", "products", "push_tokens", "referral_codes", "referral_links", 
            "rides", "roles", "service_bookings", "service_subscriptions", "user_roles", 
            "wallet_transactions", "wallets"
        ];
        const counts: any = {};
        for (const t of tables) {
            const result = await AppDataSource.query(`SELECT COUNT(*) as cnt FROM ${t}`);
            counts[t] = parseInt(result[0].cnt);
        }
        res.json(counts);
    } catch(e: any) { res.status(500).send(e.message); }
});

/**
 * @openapi
 * /:
 *   get:
 *     tags: [Health]
 *     summary: Basic health check
 *     security: []
 *     responses:
 *       200:
 *         description: API is running
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Velo Backend API is running!
 */

/**
 * @openapi
 * /health:
 *   get:
 *     tags: [Health]
 *     summary: Detailed health check
 *     description: Returns API status, uptime, and connectivity to Postgres & Redis.
 *     security: []
 *     responses:
 *       200:
 *         description: All services healthy
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/HealthResponse'
 *       503:
 *         description: One or more services unhealthy
 */
router.get("/health", async (_req: Request, res: Response) => {
  const checks: Record<string, string> = {};

  // Check Postgres
  try {
    if (AppDataSource.isInitialized) {
      await AppDataSource.query("SELECT 1");
      checks.database = "connected";
    } else {
      checks.database = "disconnected";
    }
  } catch {
    checks.database = "disconnected";
  }

  // Check Redis
  try {
    await redis.ping();
    checks.redis = "connected";
  } catch {
    checks.redis = "disconnected";
  }

  const allHealthy = Object.values(checks).every((v) => v === "connected");

  const payload = {
    status: allHealthy ? "healthy" : "degraded",
    version: "1.0.1",
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    services: checks,
  };

  return res.status(allHealthy ? 200 : 503).json(payload);
});

export default router;
