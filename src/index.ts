import "dotenv/config";
import express, { Request, Response } from "express";
import cors from "cors";
import { createServer } from "http";
import swaggerUi from "swagger-ui-express";
import { AppDataSource } from "./db/data-source";
import { swaggerSpec } from "./swagger";
import { ensureBucket } from "./utils/minio-client";
import logger from "./utils/logger";
import { metricsMiddleware, register } from "./utils/metrics";
import path from "path";
import { initSocketGateway } from "./socket-gateway";
import { runSeeds } from "./scripts/run-seeds";


import orderRoutes from "./routes/orderRoutes";
import profileRoutes from "./routes/profileRoutes";
import supportRoutes from "./routes/supportRoutes";
import authRoutes from "./routes/authRoutes";
import devRoutes from "./routes/devRoutes";
import rideRoutes from "./routes/rideRoutes";
import driverRoutes from "./routes/driverRoutes";
import paymentRoutes from "./routes/paymentRoutes";
import walletRoutes from "./routes/walletRoutes";
import locationRoutes from "./routes/locationRoutes";
import ratingRoutes from "./routes/ratingRoutes";
import placesRoutes from "./routes/placesRoutes";
import notificationRoutes from "./routes/notificationRoutes";
import healthRoutes from "./routes/healthRoutes";
import uploadRoutes from "./routes/uploadRoutes";
import adminRoutes from "./routes/adminRoutes";
import waitlistRoutes from "./routes/waitlistRoutes";
import productRoutes from "./routes/productRoutes";
import merchantRoutes from "./routes/merchantRoutes";
import searchRoutes from "./routes/searchRoutes";
import cartRoutes from "./routes/cartRoutes";
import marketplaceOrderRoutes from "./routes/marketplaceOrderRoutes";
import setupRoutes from "./routes/setupRoutes";
import auditLogRoutes from "./routes/auditLogRoutes";
import serviceBookingRoutes from "./routes/service-booking-routes";
import subscriptionRoutes from "./routes/subscription-routes";
import identityRoutes from "./routes/identityRoutes";
import checkoutRoutes from "./routes/checkoutRoutes";
import supabaseRoutes from "./routes/supabaseRoutes";


const app = express();
const httpServer = createServer(app);
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
// Webhook routes must come before express.json()
app.use('/api/v1/identity/webhook', express.raw({ type: 'application/json' }));
app.post('/api/v1/payments/webhook', express.raw({ type: 'application/json' }));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));
app.use(metricsMiddleware);

// Prometheus metrics endpoint
app.get("/metrics", async (_req: Request, res: Response) => {
  res.set("Content-Type", register.contentType);
  res.end(await register.metrics());
});

// Swagger docs
app.use("/docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: "Velo API Docs",
  swaggerOptions: {
    persistAuthorization: true,        // Remember API key across page reloads
    tryItOutEnabled: true,             // "Try it out" is ON by default
    filter: true,                      // Search bar to filter endpoints
    displayRequestDuration: true,      // Show how long requests take
    docExpansion: "list",              // Show all tags collapsed with summaries
    defaultModelsExpandDepth: 2,       // Expand schema models
    defaultModelExpandDepth: 2,
  },
}));
app.get("/docs.json", (_req: Request, res: Response) => {
  res.setHeader("Content-Type", "application/json");
  res.send(swaggerSpec);
});

// Health
app.use(healthRoutes);

// Handled by express.raw at the top

app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/profile", profileRoutes);
app.use("/api/v1/support", supportRoutes);
app.use("/api/v1/dev", devRoutes);
app.use("/api/v1/rides", rideRoutes);
app.use("/api/v1/driver", driverRoutes);
app.use("/api/v1/payments", paymentRoutes);
app.use("/api/v1/wallet", walletRoutes);
app.use("/api/v1/locations", locationRoutes);
app.use("/api/v1/ratings", ratingRoutes);
app.use("/api/v1/places", placesRoutes);
app.use("/api/v1/notifications", notificationRoutes);
app.use("/api/v1/uploads", uploadRoutes);
app.use("/api/v1/admin", adminRoutes);
app.use("/api/v1/waitlist", waitlistRoutes);
app.use("/api/v1/products", productRoutes);
app.use("/api/v1/merchant", merchantRoutes);
app.use("/api/v1/search", searchRoutes);
app.use("/api/v1/cart", cartRoutes);
app.use("/api/v1/marketplace/orders", marketplaceOrderRoutes);
app.use("/api/v1/setup", setupRoutes);
app.use("/api/v1/admin/audit-logs", auditLogRoutes);
app.use("/api/v1/services/bookings", serviceBookingRoutes);
app.use("/api/v1/services/subscriptions", subscriptionRoutes);
app.use("/api/v1/identity", identityRoutes);
app.use("/api/v1/checkout", checkoutRoutes);
app.use("/api/v1/admin/supabase", supabaseRoutes);

app.use("/api/orders", orderRoutes);

// Explicit DB Viewer Route for local dev
app.get("/api/v1/db-viewer", (_req, res) => {
  res.sendFile(path.join(__dirname, "../public/db-viewer.html"));
});

app.get("/api/v1/db-viewer.html", (_req, res) => {
  res.sendFile(path.join(__dirname, "../public/db-viewer.html"));
});


// Root — Dashboard
app.get("/", (_req: Request, res: Response) => {
  const uptime = Math.floor(process.uptime());
  const hours = Math.floor(uptime / 3600);
  const minutes = Math.floor((uptime % 3600) / 60);
  const seconds = uptime % 60;

  res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Velo API</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0f172a; color: #e2e8f0; min-height: 100vh; display: flex; align-items: center; justify-content: center; }
    .container { max-width: 640px; width: 100%; padding: 2rem; }
    .logo { font-size: 2.5rem; font-weight: 800; background: linear-gradient(135deg, #22c55e, #10b981); -webkit-background-clip: text; -webkit-text-fill-color: transparent; margin-bottom: 0.25rem; }
    .subtitle { color: #94a3b8; font-size: 0.95rem; margin-bottom: 2rem; }
    .card { background: #1e293b; border-radius: 12px; padding: 1.5rem; margin-bottom: 1rem; border: 1px solid #334155; }
    .card h3 { font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.1em; color: #64748b; margin-bottom: 0.75rem; }
    .status-row { display: flex; align-items: center; justify-content: space-between; padding: 0.5rem 0; border-bottom: 1px solid #334155; }
    .status-row:last-child { border-bottom: none; }
    .status-row .label { color: #cbd5e1; font-size: 0.9rem; }
    .badge { padding: 0.2rem 0.6rem; border-radius: 9999px; font-size: 0.75rem; font-weight: 600; }
    .badge-green { background: #064e3b; color: #34d399; }
    .badge-blue { background: #1e3a5f; color: #60a5fa; }
    .links { display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; margin-top: 1rem; }
    .link-card { background: #1e293b; border: 1px solid #334155; border-radius: 10px; padding: 1rem; text-decoration: none; color: #e2e8f0; transition: border-color 0.2s; }
    .link-card:hover { border-color: #22c55e; }
    .link-card .link-title { font-weight: 600; font-size: 0.95rem; margin-bottom: 0.25rem; }
    .link-card .link-desc { color: #64748b; font-size: 0.8rem; }
    .footer { text-align: center; color: #475569; font-size: 0.8rem; margin-top: 2rem; }
    #services .status-row .badge { min-width: 60px; text-align: center; }
  </style>
</head>
<body>
  <div class="container">
    <div class="logo">⚡ Velo API</div>
    <div class="subtitle">Ride-hailing & delivery backend — v1.0.0</div>

    <div class="card">
      <h3>Server</h3>
      <div class="status-row">
        <span class="label">Status</span>
        <span class="badge badge-green">● Running</span>
      </div>
      <div class="status-row">
        <span class="label">Uptime</span>
        <span class="badge badge-blue">${hours}h ${minutes}m ${seconds}s</span>
      </div>
      <div class="status-row">
        <span class="label">Environment</span>
        <span class="badge badge-blue">${process.env.NODE_ENV || "development"}</span>
      </div>
    </div>

    <div class="card" id="services">
      <h3>Services</h3>
      <div id="svc-loading">
        <div class="status-row">
          <span class="label">Loading...</span>
        </div>
      </div>
    </div>

    <div class="links">
      <a href="/docs" class="link-card">
        <div class="link-title">📖 API Docs</div>
        <div class="link-desc">Interactive Swagger UI</div>
      </a>
      <a href="/health" class="link-card">
        <div class="link-title">💚 Health</div>
        <div class="link-desc">JSON health check</div>
      </a>
      <a href="/docs.json" class="link-card">
        <div class="link-title">📋 OpenAPI Spec</div>
        <div class="link-desc">Raw JSON schema</div>
      </a>
      <a href="/db-viewer.html" class="link-card">
        <div class="link-title">🗃️ DB Viewer</div>
        <div class="link-desc">Browse database</div>
      </a>
    </div>

    <div class="footer">VeloCourier &copy; ${new Date().getFullYear()}</div>
  </div>

  <script>
    fetch('/health')
      .then(r => r.json())
      .then(data => {
        const el = document.getElementById('svc-loading');
        let html = '';
        for (const [name, status] of Object.entries(data.services)) {
          const cls = status === 'connected' ? 'badge-green' : 'badge-red';
          const dot = status === 'connected' ? '●' : '○';
          html += '<div class="status-row"><span class="label">' + name.charAt(0).toUpperCase() + name.slice(1) + '</span><span class="badge ' + cls + '">' + dot + ' ' + status + '</span></div>';
        }
        el.innerHTML = html;
      })
      .catch(() => {
        document.getElementById('svc-loading').innerHTML = '<div class="status-row"><span class="label">Could not fetch health</span></div>';
      });
  </script>
</body>
</html>
  `);
});

// Initialize database connection
AppDataSource.initialize()
  .then(async () => {
    logger.info("Data Source has been initialized");

    // Ensure MinIO bucket exists
    try {
      await ensureBucket();
      logger.info("MinIO bucket ready");
    } catch (err) {
      logger.warn("MinIO bucket init failed (uploads may not work)", { error: (err as Error).message });
    }

    // Seed essential lookup tables (idempotent — skips existing rows)
    await runSeeds();

    // Initialise Socket.IO on the same HTTP server
    initSocketGateway(httpServer);

    // Start server
    httpServer.listen(PORT,  async () => {
      logger.info(`Server is running on port ${PORT}.`);
      logger.info(`WebSocket ready on ws://localhost:${PORT} (/drivers, /rides)`);
      logger.info(`API Docs: http://localhost:${PORT}/docs`);
      logger.info(`Health: http://localhost:${PORT}/health`);
      logger.info(`Metrics: http://localhost:${PORT}/metrics`);
    });
  })
  .catch((error: Error) => {
    logger.error("Error during Data Source initialization", { error: error.message });
  });
