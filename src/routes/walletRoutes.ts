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
 *     description: Returns the user's wallet. Auto-creates one if it doesn't exist.
 *     parameters:
 *       - $ref: '#/components/parameters/PhoneNumber'
 *     responses:
 *       200:
 *         description: Wallet object with balance
 */
router.get("/", walletRoles, walletController.getWallet);

/**
 * @openapi
 * /wallet/transactions:
 *   get:
 *     tags: [Wallet]
 *     summary: Get wallet transactions
 *     parameters:
 *       - $ref: '#/components/parameters/PhoneNumber'
 *       - $ref: '#/components/parameters/Limit'
 *       - $ref: '#/components/parameters/Offset'
 *     responses:
 *       200:
 *         description: Paginated transaction list
 */
router.get("/transactions", walletRoles, walletController.getTransactions);

export default router;
