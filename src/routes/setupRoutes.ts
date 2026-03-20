import { Router } from "express";
import { DevController } from "../controllers/DevController";

const router = Router();
const devController = new DevController();

/**
 * @openapi
 * /setup/create-admin:
 *   post:
 *     tags: [Setup]
 *     summary: Create an admin user (no auth)
 *     description: Creates or updates a user and assigns them the admin role. FOR SETUP/EMERGENCY ONLY.
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
 *               email:
 *                 type: string
 *               fullName:
 *                 type: string
 *     responses:
 *       200:
 *         description: Admin user created/updated successfully
 *       400:
 *         description: Missing phone number
 *       500:
 *         description: Server error
 */
router.post("/create-admin", devController.createAdmin);

export default router;
