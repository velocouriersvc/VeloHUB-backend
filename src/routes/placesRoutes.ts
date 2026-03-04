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
 *     description: Returns Google Places predictions as the user types. Biased to Ghana. Requires **buyer** or **driver** role.
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/PhoneNumber'
 *       - name: input
 *         in: query
 *         required: true
 *         description: Search text (e.g. "Accra Mall")
 *         schema:
 *           type: string
 *         example: "Accra Mall"
 *       - name: sessionToken
 *         in: query
 *         required: false
 *         description: Google session token for billing grouping
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Array of place predictions
 *       400:
 *         description: input query param is required
 *       403:
 *         description: Invalid API key or role not approved
 */
router.get("/autocomplete", anyRole, placesController.autocomplete);

/**
 * @openapi
 * /places/details/{placeId}:
 *   get:
 *     tags: [Places]
 *     summary: Get place details (lat/lng)
 *     description: Returns full place object with coordinates from a Google Place ID. Requires **buyer** or **driver** role.
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - name: placeId
 *         in: path
 *         required: true
 *         description: Google Place ID
 *         schema:
 *           type: string
 *         example: "ChIJLfyY2E4MFRcRVqoqilxjRJI"
 *       - $ref: '#/components/parameters/PhoneNumber'
 *       - name: sessionToken
 *         in: query
 *         required: false
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Place object with coordinates
 *       400:
 *         description: Place not found
 *       403:
 *         description: Invalid API key or role not approved
 */
router.get("/details/:placeId", anyRole, placesController.getPlaceDetails);

/**
 * @openapi
 * /places/distance:
 *   post:
 *     tags: [Places]
 *     summary: Get driving distance & duration
 *     description: Returns distance (km) and duration (min) between two coordinates. Requires **buyer** or **driver** role.
 *     security:
 *       - ApiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/DistanceBody'
 *           example:
 *             phoneNumber: "+233501234567"
 *             originLat: 5.6037
 *             originLng: -0.187
 *             destLat: 5.6502
 *             destLng: -0.1869
 *     responses:
 *       200:
 *         description: Distance and duration
 *       400:
 *         description: Missing coordinates
 *       403:
 *         description: Invalid API key or role not approved
 */
router.post("/distance", anyRole, placesController.getDistance);

/**
 * @openapi
 * /places/reverse-geocode:
 *   post:
 *     tags: [Places]
 *     summary: Reverse geocode coordinates
 *     description: Returns a human-readable address from lat/lng. Requires **buyer** or **driver** role.
 *     security:
 *       - ApiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ReverseGeocodeBody'
 *           example:
 *             phoneNumber: "+233501234567"
 *             lat: 5.6037
 *             lng: -0.187
 *     responses:
 *       200:
 *         description: Address string
 *       400:
 *         description: lat and lng required
 *       403:
 *         description: Invalid API key or role not approved
 */
router.post("/reverse-geocode", anyRole, placesController.reverseGeocode);

export default router;
