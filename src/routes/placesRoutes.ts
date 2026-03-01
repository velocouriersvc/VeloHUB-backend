import { Router } from "express";
import { PlacesController } from "../controllers/PlacesController";
import { apiKeyMiddleware } from "../middleware/api-key-middleware";
import { requireRole } from "../middleware/role-middleware";

const router = Router();
const placesController = new PlacesController();

// Apply API Key Middleware
router.use(apiKeyMiddleware);

// Both buyers and drivers can use places
const anyRole = requireRole(["buyer", "driver"]);

router.get("/autocomplete", anyRole, placesController.autocomplete);
router.get("/details/:placeId", anyRole, placesController.getPlaceDetails);
router.post("/distance", anyRole, placesController.getDistance);
router.post("/reverse-geocode", anyRole, placesController.reverseGeocode);

export default router;
