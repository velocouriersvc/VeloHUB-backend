import { AppDataSource } from "../db/data-source";
import { ReferralCode } from "../models/referral-code";
import { ReferralLink, ReferralStatus } from "../models/referral-link";
import { PlatformSettings } from "../models/platform-settings";
import { User } from "../models/user";
import { WalletService } from "./wallet-service";
import { NotificationService } from "./notification-service";
import { NotificationType } from "../models/notification";
import { createServiceLogger } from "../utils/logger";

const log = createServiceLogger("ReferralService");

/**
 * Customer referral program: every user has a unique code; a new user can enter a code at
 * signup to get the referee reward, and the referrer earns the referrer reward when that
 * referee completes their first ride or order. Amounts come from platform_settings per
 * country (referralRewardAmount = referrer, referralRefereeReward = referee) in local currency.
 */
export class ReferralService {
    private codeRepo = AppDataSource.getRepository(ReferralCode);
    private linkRepo = AppDataSource.getRepository(ReferralLink);
    private settingsRepo = AppDataSource.getRepository(PlatformSettings);
    private userRepo = AppDataSource.getRepository(User);
    private wallet = new WalletService();
    private notifications = new NotificationService();

    private genCode(): string {
        const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no ambiguous 0/O/1/I
        let s = "";
        for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)];
        return s;
    }

    /**
     * Reward amounts always denominated in the USER'S currency. We resolve the target currency
     * FIRST (explicit display currency -> wallet currency -> fallbackCountry's currency -> USD),
     * then the amounts: the per-currency config row for that currency if one exists (e.g. GHS -> 80),
     * otherwise the DEFAULT (then US) baseline. We never borrow an unrelated market's currency, so a
     * user whose currency has no dedicated config (e.g. EUR) sees their own currency with the baseline
     * amount instead of GHS.
     */
    private async rewardsForWalletOf(userId: string, fallbackCountry?: string, preferCurrency?: string): Promise<{ referrer: number; referee: number; currency: string }> {
        // 1. Target currency.
        let currency = String(preferCurrency || "").trim().toUpperCase();
        if (!currency) {
            const wallet = await this.wallet.getWallet(userId);
            currency = String(wallet?.currency || "").trim().toUpperCase();
        }
        if (!currency && fallbackCountry) {
            const cRow = await this.settingsRepo.findOne({ where: { country: fallbackCountry } });
            currency = String(cRow?.currency || "").trim().toUpperCase();
        }
        if (!currency) currency = "USD";

        // 2. Amounts: this currency's own config, else the DEFAULT (then US) baseline.
        const row = (await this.settingsRepo.findOne({ where: { currency } }))
            || (await this.settingsRepo.findOne({ where: { country: "DEFAULT" } }))
            || (await this.settingsRepo.findOne({ where: { country: "US" } }));
        return {
            referrer: Number(row?.referralRewardAmount ?? 5) || 5,
            referee: Number(row?.referralRefereeReward ?? 10) || 10,
            currency,
        };
    }

    /** The user's referral code (created on first request) plus reward amounts + progress.
     *  `displayCurrency` (the app's Default Currency) picks which market's amounts to show. */
    async getOrCreateCode(userId: string, displayCurrency?: string) {
        let rec = await this.codeRepo.findOne({ where: { userId } });
        if (!rec) {
            let code = this.genCode();
            for (let attempt = 0; attempt < 6; attempt++) {
                if (!(await this.codeRepo.findOne({ where: { code } }))) break;
                code = this.genCode();
            }
            try {
                rec = await this.codeRepo.save(this.codeRepo.create({ userId, code }));
            } catch {
                rec = await this.codeRepo.findOne({ where: { userId } }); // concurrent create
            }
        }
        const user = await this.userRepo.findOne({ where: { id: userId } });
        const rewards = await this.rewardsForWalletOf(userId, user?.country || "GH", displayCurrency);
        const links = await this.linkRepo.find({ where: { referrerId: userId } });
        const completed = links.filter((l) => l.status === ReferralStatus.COMPLETED);
        return {
            code: rec?.code || "",
            referrerReward: rewards.referrer,
            refereeReward: rewards.referee,
            currency: rewards.currency,
            invited: links.length,
            completed: completed.length,
            earned: completed.reduce((sum, l) => sum + Number(l.rewardAmount || 0), 0),
        };
    }

    /** Apply a referral code for a brand-new user at signup. Non-fatal on any error. */
    async applyAtSignup(newUserId: string, rawCode: string | null | undefined, country?: string): Promise<void> {
        const code = String(rawCode || "").trim().toUpperCase();
        if (!code) return;
        try {
            const owner = await this.codeRepo.findOne({ where: { code } });
            if (!owner || owner.userId === newUserId) return; // invalid code or self-referral
            if (await this.linkRepo.findOne({ where: { referredId: newUserId } })) return; // already referred

            // Ensure the referee has a wallet (in their market's currency) before pricing/crediting.
            if (!(await this.wallet.getWallet(newUserId))) await this.wallet.createWallet(newUserId, country || "GH");

            // Record the pending link (referrer's future payout, in their own market). NO credit is
            // paid yet: both the referee's and the referrer's rewards are granted only after the
            // referee's FIRST purchase completes, and are non-withdrawable (see rewardReferrerOnFirstCompletion).
            const referrerRewards = await this.rewardsForWalletOf(owner.userId);
            await this.linkRepo.save(this.linkRepo.create({
                referrerId: owner.userId,
                referredId: newUserId,
                referralCodeString: code,
                status: ReferralStatus.PENDING,
                rewardAmount: referrerRewards.referrer,
            }));
            log.info("Referral link created at signup (credit deferred to first purchase)", { newUserId, referrerId: owner.userId, code });
        } catch (e) {
            log.warn("applyAtSignup failed (non-fatal)", { newUserId, error: (e as Error).message });
        }
    }

    /** When the referee completes their FIRST ride/order (i.e. buys something), pay BOTH parties their
     *  referral reward as NON-WITHDRAWABLE (in-app only) credit. Idempotent (only a PENDING link is ever
     *  paid, then flipped to COMPLETED). Non-fatal on error. */
    async rewardReferrerOnFirstCompletion(referredUserId: string): Promise<void> {
        try {
            const link = await this.linkRepo.findOne({ where: { referredId: referredUserId, status: ReferralStatus.PENDING } });
            if (!link) return;
            link.status = ReferralStatus.COMPLETED;
            link.completedAt = new Date();
            await this.linkRepo.save(link);

            const referrer = await this.userRepo.findOne({ where: { id: link.referrerId } });
            const referrerAmount = Number(link.rewardAmount || 0);
            const refereeAmount = (await this.rewardsForWalletOf(referredUserId)).referee; // referee's own market

            // The referee bought something, so both rewards unlock now (in-app credit, not withdrawable).
            await this.creditWalletSafe(link.referrerId, referrerAmount, referrer?.country || "GH", "Referral reward - your invite made their first purchase", { type: "referral_referrer", referredId: referredUserId });
            await this.creditWalletSafe(referredUserId, refereeAmount, referrer?.country || "GH", "Referral bonus - unlocked by your first purchase", { type: "referral_referee", referrerId: link.referrerId });

            await this.notifications
                .notify(link.referrerId, NotificationType.WALLET_CREDITED, "Referral reward earned", `You earned ${referrerAmount} in-app credit because your invite made their first VeloHUB purchase.`, {})
                .catch(() => {});
            await this.notifications
                .notify(referredUserId, NotificationType.WALLET_CREDITED, "Referral bonus unlocked", `Your ${refereeAmount} referral credit is now in your wallet for in-app use.`, {})
                .catch(() => {});
            log.info("Referral rewards paid on first purchase", { referrerId: link.referrerId, referredUserId, referrerAmount, refereeAmount });
        } catch (e) {
            log.warn("rewardReferrerOnFirstCompletion failed (non-fatal)", { referredUserId, error: (e as Error).message });
        }
    }

    /** All referral credit is promo/non-withdrawable: spendable in-app, excluded from payouts. */
    private async creditWalletSafe(userId: string, amount: number, country: string, description: string, metadata: Record<string, any>) {
        if (!amount || amount <= 0) return;
        let w = await this.wallet.getWallet(userId);
        if (!w) w = await this.wallet.createWallet(userId, country);
        await this.wallet.credit(userId, amount, description, metadata, true); // promo: non-withdrawable
    }
}
