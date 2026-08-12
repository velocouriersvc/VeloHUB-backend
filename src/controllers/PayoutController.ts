import { Response } from "express";
import { AuthRequest } from "../middleware/role-middleware";
import { PayoutService, PayoutRole } from "../services/payout-service";
import { WalletService } from "../services/wallet-service";
import { RideService } from "../services/ride-service";
import { DeliveryService } from "../services/delivery-service";
import { OtpService } from "../services/otp-service";
import { createServiceLogger } from "../utils/logger";

const log = createServiceLogger("PayoutController");

// Minimum withdrawable balance to show/allow an instant payout, per currency.
const MIN_BALANCE: Record<string, number> = { NGN: 500, GHS: 20 };
const MAX_PAYOUTS_PER_DAY = 3;

export class PayoutController {
    private payouts = new PayoutService();
    private wallet = new WalletService();
    private rides = new RideService();
    private deliveries = new DeliveryService();
    private otp = new OtpService();

    private roleFrom(req: AuthRequest): PayoutRole {
        const r = String(req.body?.role || req.query?.role || "").toLowerCase();
        if (r === "merchant") return "merchant";
        if (r === "driver") return "driver";
        // Infer from the user's roles when not explicit.
        const names = (req.user?.roles || []).map((x) => x.name);
        return names.includes("merchant") && !names.includes("driver") ? "merchant" : "driver";
    }

    /** GET /payouts/banks?currency=NGN */
    listBanks = async (req: AuthRequest, res: Response) => {
        try {
            const currency = String(req.query.currency || "").toUpperCase()
                || (await this.wallet.getWallet(req.user!.id))?.currency
                || "NGN";
            const banks = await this.payouts.listBanks(currency);
            return res.json({ banks, currency });
        } catch (error) {
            log.error("listBanks failed", { error: (error as Error).message });
            return res.status(500).json({ message: "Could not load banks" });
        }
    };

    /** GET /payouts/bank */
    getBank = async (req: AuthRequest, res: Response) => {
        try {
            const details = await this.payouts.getBankDetails(req.user!.id, this.roleFrom(req));
            return res.json({ bank: details });
        } catch (error) {
            return res.status(500).json({ message: (error as Error).message });
        }
    };

    /** POST /payouts/bank { role, bankCode, accountNumber, bankName, isMomo } */
    saveBank = async (req: AuthRequest, res: Response) => {
        try {
            const { bankCode, accountNumber, bankName, isMomo } = req.body;
            const details = await this.payouts.saveBankDetails(req.user!.id, this.roleFrom(req), {
                bankCode, accountNumber, bankName, isMomo: !!isMomo,
            });
            return res.json({ bank: details, message: "Bank details saved" });
        } catch (error) {
            return res.status(400).json({ message: (error as Error).message });
        }
    };

    /** POST /payouts/quote { amount } */
    quote = async (req: AuthRequest, res: Response) => {
        try {
            const q = await this.payouts.quote(req.user!.id, Number(req.body.amount));
            return res.json(q);
        } catch (error) {
            return res.status(400).json({ message: (error as Error).message });
        }
    };

    /** POST /payouts/otp - send a payout confirmation code (merchant). */
    sendOtp = async (req: AuthRequest, res: Response) => {
        try {
            const phone = req.user!.phoneNumber;
            if (!phone) return res.status(400).json({ message: "No phone on file for OTP" });
            await this.otp.createOtp(phone, "sms");
            return res.json({ message: "OTP sent" });
        } catch (error) {
            return res.status(400).json({ message: (error as Error).message });
        }
    };

    /** POST /payouts/instant { role, amount, otp? } - Option 2: fires the transfer now. */
    instant = async (req: AuthRequest, res: Response) => {
        try {
            const userId = req.user!.id;
            const role = this.roleFrom(req);
            const amount = Number(req.body.amount);
            if (!amount || amount <= 0) return res.status(400).json({ message: "Enter a valid amount" });

            const wallet = await this.wallet.getWallet(userId);
            if (!wallet) return res.status(400).json({ message: "Wallet not found" });
            const bank = await this.payouts.getBankDetails(userId, role);
            if (!bank) return res.status(400).json({ message: "Add your bank details before requesting a payout" });

            const min = MIN_BALANCE[(wallet.currency || "NGN").toUpperCase()] ?? 0;
            // Only the withdrawable balance counts (promo/referral credit is spendable in-app, not withdrawable).
            const balance = await this.wallet.getWithdrawableBalance(userId);
            if (balance <= min) {
                return res.status(400).json({ message: `A minimum withdrawable balance of ${min} ${wallet.currency} is required for instant payouts` });
            }

            if (role === "driver") {
                if ((await this.payouts.payoutsToday(userId)) >= MAX_PAYOUTS_PER_DAY) {
                    return res.status(429).json({ message: "You have reached the daily payout limit. Try again tomorrow." });
                }
                const activeRide = await this.rides.getDriverActiveRide(userId).catch(() => null);
                const activeDelivery = await this.deliveries.getActiveDelivery(userId).catch(() => null);
                if (activeRide || activeDelivery) {
                    return res.status(409).json({ message: "Finish your active trip before requesting a payout" });
                }
            } else {
                // Merchant: only the business owner can request a payout. The former SMS OTP
                // confirmation was removed because the code was not being delivered (it went to
                // a MoMo number that does not receive it); payouts stay protected by the
                // pre-verified bank/recipient and the minimum-balance check, same as drivers.
                const isMerchant = (req.user?.roles || []).some((r) => r.name === "merchant");
                if (!isMerchant) return res.status(403).json({ message: "Only the business owner can request a payout" });
            }

            const result = await this.payouts.instantPayout(userId, {
                amount,
                reason: `On-Demand ${role} Payout`,
                audit: {
                    role,
                    userId,
                    ip: (req.headers["x-forwarded-for"] as string) || req.socket?.remoteAddress || null,
                    requestedAt: new Date().toISOString(),
                },
            });
            return res.json({ ...result, message: "Payout is processing" });
        } catch (error) {
            log.error("instant payout failed", { error: (error as Error).message });
            return res.status(400).json({ message: (error as Error).message });
        }
    };
}
