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

/**
 * @openapi
 * /places/autocomplete:
 *   get:
 *     tags: [Places]
 *     summary: Search places (autocomplete)
 *     description: Returns Google Places predictions as the user types. Biased to Ghana.
 *     parameters:
 *       - $ref: '#/components/parameters/PhoneNumber'
 *       - name: input
 *         in: query
 *         required: true
 *         schema:
 *           type: string
 *         description: Search text
 *       - name: sessionToken
 *         in: query
 *         schema:
 *           type: string
 *         description: Google session token for billing grouping
 *     responses:
 *       200:
 *         description: Array of place predictions
 *       400:
 *         description: input is required
 */
router.get("/autocomplete", anyRole, placesController.autocomplete);

/**
 * @openapi
 * /places/details/{placeId}:
 *   get:
 *     tags: [Places]
 *     summary: Get place details (lat/lng)
 *     parameters:
 *       - name: placeId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *       - $ref: '#/components/parameters/PhoneNumber'
 *       - name: sessionToken
 *         in: query
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Place object with coordinates
 *       400:
 *         description: Place not found
 */
router.get("/details/:placeId", anyRole, placesController.getPlaceDetails);

/**
 * @openapi
 * /places/distance:
 *   post:
 *     tags: [Places]
 *     summary: Get driving distance & duration
 *     description: Returns distance (km) and duration (min) between two coordinates.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/DistanceBody'
 *     responses:
 *       200:
 *         description: Distance and duration
 *       400:
 *         description: Missing coordinates
 */
router.post("/distance", anyRole, placesController.getDistance);

/**
 * @openapi
 * /places/reverse-geocode:
 *   post:
 *     tags: [Places]
 *     summary: Reverse geocode coordinates
 *     description: Returns a human-readable address from lat/lng.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ReverseGeocodeBody'
 *     responses:
 *       200:
 *         description: Address string
 *       400:
 *         description: lat and lng required
 */
router.post("/reverse-geocode", anyRole, placesController.reverseGeocode);

export default router;
