import { Router } from "express";
import { LocationController } from "../controllers/LocationController";
import { apiKeyMiddleware } from "../middleware/api-key-middleware";
import { requireRole } from "../middleware/role-middleware";

const router = Router();
const locationController = new LocationController();

// Apply API Key Middleware
router.use(apiKeyMiddleware);

// Saved locations — buyer role
const buyerRole = requireRole(["buyer"]);

router.post("/", buyerRole, locationController.saveLocation);
router.get("/", buyerRole, locationController.getLocations);
router.put("/:id", buyerRole, locationController.updateLocation);
router.delete("/:id", buyerRole, locationController.deleteLocation);

export default router;
