import { Router } from "express";
import { RideController } from "../controllers/RideController";
import { apiKeyMiddleware } from "../middleware/api-key-middleware";
import { requireRole } from "../middleware/role-middleware";

const router = Router();
const rideController = new RideController();

// Apply API Key Middleware to all ride routes
router.use(apiKeyMiddleware);

// Fare estimates (buyer role)
router.post("/estimate", requireRole(["buyer"]), rideController.getEstimates);
router.post("/estimate/:vehicleType", requireRole(["buyer"]), rideController.getEstimate);

// Ride lifecycle (buyer role)
router.post("/request", requireRole(["buyer"]), rideController.requestRide);
router.post("/:id/payment", requireRole(["buyer"]), rideController.setPayment);
router.post("/:id/cancel", requireRole(["buyer", "driver"]), rideController.cancelRide);

// Ride queries (buyer role)
router.get("/active", requireRole(["buyer"]), rideController.getActiveRide);
router.get("/history", requireRole(["buyer"]), rideController.getRideHistory);
router.get("/:id", requireRole(["buyer", "driver"]), rideController.getRide);

export default router;
