import { Router } from "express";
import { WaitlistController } from "../controllers/WaitlistController";
import { apiKeyMiddleware } from "../middleware/api-key-middleware";
import { requireRole } from "../middleware/role-middleware";

const router = Router();
const waitlistController = new WaitlistController();

/**
 * @openapi
 * /waitlist/join:
 *   post:
 *     tags: [Waitlist]
 *     summary: Join the waitlist
 *     description: Register interest for Velo in a specific country/city. No role required.
 *     security:
 *       - ApiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [phoneNumber, country]
 *             properties:
 *               phoneNumber:
 *                 type: string
 *                 example: "+233501234567"
 *               country:
 *                 type: string
 *                 example: "Ghana"
 *               city:
 *                 type: string
 *                 example: "Accra"
 *               name:
 *                 type: string
 *                 example: "Kwame Asante"
 *     responses:
 *       201:
 *         description: Successfully joined the waitlist
 *       400:
 *         description: Missing required fields or already on waitlist
 *       403:
 *         description: Invalid API key
 */
router.post("/join", apiKeyMiddleware, waitlistController.joinWaitlist);

/**
 * @openapi
 * /waitlist/countries:
 *   get:
 *     tags: [Waitlist]
 *     summary: Get available countries
 *     description: Returns list of countries where Velo operates or is planned.
 *     security:
 *       - ApiKeyAuth: []
 *     responses:
 *       200:
 *         description: List of countries
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 countries:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       name:
 *                         type: string
 *                       code:
 *                         type: string
 *                       isActive:
 *                         type: boolean
 *       403:
 *         description: Invalid API key
 */
router.get("/countries", apiKeyMiddleware, waitlistController.getCountries);

/**
 * @openapi
 * /waitlist/entries:
 *   get:
 *     tags: [Waitlist]
 *     summary: List waitlist entries (admin)
 *     description: Returns all waitlist entries. Requires **admin** role.
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/PhoneNumber'
 *     responses:
 *       200:
 *         description: List of waitlist entries
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 entries:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       phoneNumber:
 *                         type: string
 *                       country:
 *                         type: string
 *                       city:
 *                         type: string
 *                       name:
 *                         type: string
 *                       createdAt:
 *                         type: string
 *                         format: date-time
 *       403:
 *         description: Invalid API key or admin role required
 */
router.get("/entries", apiKeyMiddleware, requireRole(["admin"]), waitlistController.getEntries);

/**
 * @openapi
 * /waitlist/entries/{id}:
 *   delete:
 *     tags: [Waitlist]
 *     summary: Delete a waitlist entry (admin)
 *     description: Remove a user from the waitlist. Requires **admin** role.
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         description: Waitlist entry ID
 *         schema:
 *           type: string
 *           format: uuid
 *       - $ref: '#/components/parameters/PhoneNumber'
 *     responses:
 *       200:
 *         description: Entry deleted
 *       404:
 *         description: Entry not found
 *       403:
 *         description: Invalid API key or admin role required
 */
router.delete("/entries/:id", apiKeyMiddleware, requireRole(["admin"]), waitlistController.deleteEntry);

/**
 * @openapi
 * /waitlist/countries:
 *   post:
 *     tags: [Waitlist]
 *     summary: Add a country (admin)
 *     description: Add a new country to the platform. Requires **admin** role.
 *     security:
 *       - ApiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, code, phoneNumber]
 *             properties:
 *               phoneNumber:
 *                 type: string
 *                 example: "+233501234567"
 *               name:
 *                 type: string
 *                 example: "Nigeria"
 *               code:
 *                 type: string
 *                 example: "NG"
 *               isActive:
 *                 type: boolean
 *                 default: false
 *     responses:
 *       201:
 *         description: Country added
 *       400:
 *         description: Missing required fields or country already exists
 *       403:
 *         description: Invalid API key or admin role required
 */
router.post("/countries", apiKeyMiddleware, requireRole(["admin"]), waitlistController.addCountry);

/**
 * @openapi
 * /waitlist/countries/{id}:
 *   patch:
 *     tags: [Waitlist]
 *     summary: Update a country (admin)
 *     description: Update country details or toggle active status. Requires **admin** role.
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Country updated
 */
router.patch("/countries/:id", apiKeyMiddleware, requireRole(["admin"]), waitlistController.updateCountry);

/**
 * @openapi
 * /waitlist/countries/{id}:
 *   delete:
 *     tags: [Waitlist]
 *     summary: Delete a country (admin)
 *     description: Remove a country from the platform. Requires **admin** role.
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       204:
 *         description: Country deleted
 */
router.delete("/countries/:id", apiKeyMiddleware, requireRole(["admin"]), waitlistController.deleteCountry);

export default router;
