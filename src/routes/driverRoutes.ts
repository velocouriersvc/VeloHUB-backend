import { Router } from "express";
import { DriverController } from "../controllers/DriverController";
import { apiKeyMiddleware } from "../middleware/api-key-middleware";
import { requireRole } from "../middleware/role-middleware";

const router = Router();
const driverController = new DriverController();

// Apply API Key Middleware to all driver routes
router.use(apiKeyMiddleware);

// All driver routes require driver role
const driverRole = requireRole(["driver"]);

// Status & location
router.post("/location", driverRole, driverController.updateLocation);
router.post("/online", driverRole, driverController.goOnline);
router.post("/offline", driverRole, driverController.goOffline);

// Ride actions
router.post("/rides/:id/accept", driverRole, driverController.acceptRide);
router.post("/rides/:id/enroute", driverRole, driverController.enroute);
router.post("/rides/:id/arrived", driverRole, driverController.arrived);
router.post("/rides/:id/start", driverRole, driverController.startRide);
router.post("/rides/:id/complete", driverRole, driverController.completeRide);

// Queries
router.get("/rides/active", driverRole, driverController.getActiveRide);
router.get("/rides/history", driverRole, driverController.getRideHistory);
router.get("/stats", driverRole, driverController.getStats);

export default router;
