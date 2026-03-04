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

/**
 * @openapi
 * /locations:
 *   post:
 *     tags: [Locations]
 *     summary: Save a new location
 *     description: Save a labelled location (Home, Work, etc.) for the buyer. Requires **buyer** role.
 *     security:
 *       - ApiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/SaveLocationBody'
 *           example:
 *             phoneNumber: "+233501234567"
 *             label: "Home"
 *             address: "123 Main St, East Legon, Accra"
 *             lat: 5.6315
 *             lng: -0.1583
 *     responses:
 *       201:
 *         description: Location saved
 *       400:
 *         description: Missing required fields
 *       403:
 *         description: Invalid API key or role not approved
 *   get:
 *     tags: [Locations]
 *     summary: Get saved locations
 *     description: Returns all saved locations for the buyer. Requires **buyer** role.
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/PhoneNumber'
 *     responses:
 *       200:
 *         description: Array of saved locations
 *       403:
 *         description: Invalid API key or role not approved
 */
router.post("/", buyerRole, locationController.saveLocation);
router.get("/", buyerRole, locationController.getLocations);

/**
 * @openapi
 * /locations/{id}:
 *   put:
 *     tags: [Locations]
 *     summary: Update a saved location
 *     description: Update label, address, or coordinates of a saved location. Requires **buyer** role.
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         description: Saved location ID (UUID)
 *         schema:
 *           type: string
 *           format: uuid
 *         example: "550e8400-e29b-41d4-a716-446655440000"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UpdateLocationBody'
 *           example:
 *             phoneNumber: "+233501234567"
 *             label: "Work"
 *             address: "456 Ring Rd, Osu, Accra"
 *             lat: 5.5571
 *             lng: -0.1818
 *     responses:
 *       200:
 *         description: Location updated
 *       400:
 *         description: Error
 *       403:
 *         description: Invalid API key or role not approved
 *   delete:
 *     tags: [Locations]
 *     summary: Delete a saved location
 *     description: Remove a saved location. Requires **buyer** role.
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         description: Saved location ID (UUID)
 *         schema:
 *           type: string
 *           format: uuid
 *         example: "550e8400-e29b-41d4-a716-446655440000"
 *       - $ref: '#/components/parameters/PhoneNumber'
 *     responses:
 *       200:
 *         description: Location deleted
 *       400:
 *         description: Error
 *       403:
 *         description: Invalid API key or role not approved
 */
router.put("/:id", buyerRole, locationController.updateLocation);
router.delete("/:id", buyerRole, locationController.deleteLocation);

export default router;
