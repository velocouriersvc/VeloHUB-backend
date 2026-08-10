import { Router } from "express";
import { ReferralController } from "../controllers/ReferralController";
import { apiKeyMiddleware } from "../middleware/api-key-middleware";
import { requireRole } from "../middleware/role-middleware";

const router = Router();
const referralController = new ReferralController();

router.use(apiKeyMiddleware);

// Any signed-in customer (buyer/driver) can view their own referral code + rewards.
const referralRoles = requireRole(["buyer", "driver"]);

/**
 * @openapi
 * /referrals/me:
 *   get:
 *     tags: [Referrals]
 *     summary: Get the current user's referral code and rewards
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/PhoneNumber'
 *     responses:
 *       200:
 *         description: Referral code, reward amounts (local currency), and progress
 */
router.get("/me", referralRoles, referralController.getMyReferral);

export default router;
