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
     * Per-currency reward amounts + currency, resolved in priority order:
     * (1) an explicit `preferCurrency` (the user's DEFAULT currency, for display),
     * (2) the user's wallet currency (where a credit actually lands),
     * (3) `fallbackCountry`, then (4) the US/DEFAULT row. The returned `currency` is the
     * resolved row's currency, so the amount and its symbol always agree.
     */
    private async rewardsForWalletOf(userId: string, fallbackCountry?: string, preferCurrency?: string): Promise<{ referrer: number; referee: number; currency: string }> {
        let s = preferCurrency ? await this.settingsRepo.findOne({ where: { currency: preferCurrency } }) : null;
        if (!s) {
            const wallet = await this.wallet.getWallet(userId);
            if (wallet?.currency) s = await this.settingsRepo.findOne({ where: { currency: wallet.currency } });
        }
        if (!s && fallbackCountry) s = await this.settingsRepo.findOne({ where: { country: fallbackCountry } });
        if (!s) s = await this.settingsRepo.findOne({ where: { country: "US" } });
        return {
            referrer: Number(s?.referralRewardAmount ?? 25) || 25,
            referee: Number(s?.referralRefereeReward ?? 10) || 10,
            currency: s?.currency || preferCurrency || "USD",
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

            // Each party is rewarded in THEIR OWN market/wallet currency: the link stores the
            // referrer's future payout (their market); the referee is credited their market's amount.
            const referrerRewards = await this.rewardsForWalletOf(owner.userId);
            const refereeRewards = await this.rewardsForWalletOf(newUserId, country || "GH");
            await this.linkRepo.save(this.linkRepo.create({
                referrerId: owner.userId,
                referredId: newUserId,
                referralCodeString: code,
                status: ReferralStatus.PENDING,
                rewardAmount: referrerRewards.referrer,
            }));
            await this.creditWalletSafe(newUserId, refereeRewards.referee, country || "GH", `Referral bonus for joining with code ${code}`, { type: "referral_referee", code });
            log.info("Referral applied at signup", { newUserId, referrerId: owner.userId, code });
        } catch (e) {
            log.warn("applyAtSignup failed (non-fatal)", { newUserId, error: (e as Error).message });
        }
    }

    /** Reward the referrer when the referee completes their FIRST ride or order. Idempotent
     *  (only a PENDING link is ever paid, then flipped to COMPLETED). Non-fatal on error. */
    async rewardReferrerOnFirstCompletion(referredUserId: string): Promise<void> {
        try {
            const link = await this.linkRepo.findOne({ where: { referredId: referredUserId, status: ReferralStatus.PENDING } });
            if (!link) return;
            link.status = ReferralStatus.COMPLETED;
            link.completedAt = new Date();
            await this.linkRepo.save(link);

            const referrer = await this.userRepo.findOne({ where: { id: link.referrerId } });
            const amount = Number(link.rewardAmount || 0);
            await this.creditWalletSafe(link.referrerId, amount, referrer?.country || "GH", "Referral reward - your invite made their first booking", { type: "referral_referrer", referredId: referredUserId });
            await this.notifications
                .notify(link.referrerId, NotificationType.WALLET_CREDITED, "Referral reward earned", `You earned ${amount} credit because your invite completed their first VeloHUB booking.`, {})
                .catch(() => {});
            log.info("Referral reward paid to referrer", { referrerId: link.referrerId, referredUserId, amount });
        } catch (e) {
            log.warn("rewardReferrerOnFirstCompletion failed (non-fatal)", { referredUserId, error: (e as Error).message });
        }
    }

    private async creditWalletSafe(userId: string, amount: number, country: string, description: string, metadata: Record<string, any>) {
        if (!amount || amount <= 0) return;
        let w = await this.wallet.getWallet(userId);
        if (!w) w = await this.wallet.createWallet(userId, country);
        await this.wallet.credit(userId, amount, description, metadata);
    }
}
