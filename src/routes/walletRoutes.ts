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

router.get("/", walletRoles, walletController.getWallet);
router.get("/transactions", walletRoles, walletController.getTransactions);

export default router;
