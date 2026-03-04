import { Router } from "express";
import { WalletController } from "../controllers/WalletController";
import { apiKeyMiddleware } from "../middleware/api-key-middleware";
import { requireRole } from "../middleware/role-middleware";

const router = Router();
const walletController = new WalletController();

// Apply API Key Middleware
router.use(apiKeyMiddleware);

// Both buyers and drivers have wallets
const walletRoles = requireRole(["buyer", "driver"]);

/**
 * @openapi
 * /wallet:
 *   get:
 *     tags: [Wallet]
 *     summary: Get wallet balance
 *     description: Returns the user's wallet. Auto-creates one if it doesn't exist. Requires **buyer** or **driver** role.
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/PhoneNumber'
 *     responses:
 *       200:
 *         description: Wallet object with balance
 *       403:
 *         description: Invalid API key or role not approved
 */
router.get("/", walletRoles, walletController.getWallet);

/**
 * @openapi
 * /wallet/transactions:
 *   get:
 *     tags: [Wallet]
 *     summary: Get wallet transactions
 *     description: Returns paginated transaction history. Requires **buyer** or **driver** role.
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/PhoneNumber'
 *       - $ref: '#/components/parameters/Limit'
 *       - $ref: '#/components/parameters/Offset'
 *     responses:
 *       200:
 *         description: Paginated transaction list
 *       403:
 *         description: Invalid API key or role not approved
 */
router.get("/transactions", walletRoles, walletController.getTransactions);

export default router;
