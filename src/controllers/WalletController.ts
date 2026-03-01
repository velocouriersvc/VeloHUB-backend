import { Response } from "express";
import { AuthRequest } from "../middleware/role-middleware";
import { WalletService } from "../services/wallet-service";

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
        } catch (error: any) {
            console.error("Error getting wallet:", error);
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
        } catch (error: any) {
            console.error("Error getting transactions:", error);
            return res.status(500).json({ message: "Internal server error" });
        }
    };
}
