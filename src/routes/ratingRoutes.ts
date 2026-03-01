import { Router } from "express";
import { RatingController } from "../controllers/RatingController";
import { apiKeyMiddleware } from "../middleware/api-key-middleware";
import { requireRole } from "../middleware/role-middleware";

const router = Router();
const ratingController = new RatingController();

// Apply API Key Middleware
router.use(apiKeyMiddleware);

router.post("/", requireRole(["buyer"]), ratingController.rateRide);
router.get("/ride/:rideId", requireRole(["buyer", "driver"]), ratingController.getRideRating);
router.get("/driver/:driverId", requireRole(["buyer", "driver"]), ratingController.getDriverRatings);

export default router;
