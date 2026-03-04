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
 *     description: Save a labelled location (Home, Work, etc.) for the buyer.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/SaveLocationBody'
 *     responses:
 *       201:
 *         description: Location saved
 *       400:
 *         description: Missing required fields
 *   get:
 *     tags: [Locations]
 *     summary: Get saved locations
 *     parameters:
 *       - $ref: '#/components/parameters/PhoneNumber'
 *     responses:
 *       200:
 *         description: Array of saved locations
 */
router.post("/", buyerRole, locationController.saveLocation);
router.get("/", buyerRole, locationController.getLocations);

/**
 * @openapi
 * /locations/{id}:
 *   put:
 *     tags: [Locations]
 *     summary: Update a saved location
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [phoneNumber]
 *             properties:
 *               phoneNumber:
 *                 type: string
 *               label:
 *                 type: string
 *               address:
 *                 type: string
 *               lat:
 *                 type: number
 *               lng:
 *                 type: number
 *     responses:
 *       200:
 *         description: Location updated
 *       400:
 *         description: Error
 *   delete:
 *     tags: [Locations]
 *     summary: Delete a saved location
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - $ref: '#/components/parameters/PhoneNumber'
 *     responses:
 *       200:
 *         description: Location deleted
 *       400:
 *         description: Error
 */
router.put("/:id", buyerRole, locationController.updateLocation);
router.delete("/:id", buyerRole, locationController.deleteLocation);

export default router;
