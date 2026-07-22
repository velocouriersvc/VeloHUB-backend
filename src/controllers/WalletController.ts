import { Response } from "express";
import { AuthRequest } from "../middleware/role-middleware";
import { WalletService } from "../services/wallet-service";
import { createServiceLogger } from "../utils/logger";

const log = createServiceLogger("WalletController");

export class WalletController {
    private walletService = new WalletService();

    /**
     * GET /wallet
     * Get wallet balance
     */
    getWallet = async (req: AuthRequest, res: Response) => {
        try {
            const userId = req.user?.id;
            if (!userId) return res.status(401).json({ message: "User ID required" });

            let wallet = await this.walletService.getWallet(userId);

            // Auto-create wallet if it doesn't exist
            if (!wallet) {
                wallet = await this.walletService.createWallet(userId);
            }

            return res.json({ wallet });
        } catch (error) {
            log.error("Error getting wallet", { error: (error as Error).message });
            return res.status(500).json({ message: "Internal server error" });
        }
    };

    /**
     * GET /wallet/transactions
     * Get wallet transaction history
     */
    getTransactions = async (req: AuthRequest, res: Response) => {
        try {
            const userId = req.user?.id;
            if (!userId) return res.status(401).json({ message: "User ID required" });

            const limit = Number(req.query.limit) || 20;
            const offset = Number(req.query.offset) || 0;

            const result = await this.walletService.getTransactions(userId, limit, offset);
            return res.json(result);
        } catch (error) {
            log.error("Error getting transactions", { error: (error as Error).message });
            return res.status(500).json({ message: "Internal server error" });
        }
    };

    /**
     * POST /wallet/request-payout
     * Request a payout from the wallet (driver or buyer). Debits the wallet and sets
     * up the Paystack recipient; an admin approves the actual disbursement.
     */
    requestPayout = async (req: AuthRequest, res: Response) => {
        try {
            const userId = req.user?.id;
            if (!userId) return res.status(401).json({ message: "User ID required" });

            const { amount, payoutMethod, accountNumber, accountName } = req.body || {};
            const result = await this.walletService.requestPayout(userId, {
                amount: Number(amount),
                payoutMethod,
                accountNumber,
                accountName,
            });
            return res.status(200).json(result);
        } catch (error) {
            log.error("Error requesting payout", { error: (error as Error).message });
            return res.status(400).json({ message: (error as Error).message });
        }
    };
}
