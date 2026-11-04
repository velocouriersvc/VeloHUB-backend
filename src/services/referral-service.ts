import { AppDataSource } from "../db/data-source";
import { ReferralCode } from "../models/referral-code";
import { ReferralLink, ReferralStatus, ReferralProgram } from "../models/referral-link";
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
    private async rewardsForWalletOf(userId: string, fallbackCountry?: string, preferCurrency?: string): Promise<{ referrer: number; referee: number; partner: number; partnerThreshold: number; currency: string }> {
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
            partner: Number(row?.partnerReferralRewardAmount ?? 25) || 25,
            partnerThreshold: Number(row?.partnerReferralThreshold ?? 10) || 10,
            currency,
        };
    }

    /** True when the user is a driver or merchant, which puts them on the partner programme. */
    private async isPartner(userId: string): Promise<boolean> {
        const rows = await this.userRepo.query(
            `SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur."roleId"
             WHERE ur."userId" = $1 AND r.name IN ('driver','merchant') LIMIT 1`,
            [userId],
        );
        return rows.length > 0;
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
            // The partner programme, so the invite screen can offer the driver /
            // merchant pitch to the people it actually applies to.
            partnerReward: rewards.partner,
            partnerThreshold: rewards.partnerThreshold,
            isPartner: await this.isPartner(userId),
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

    /**
     * A referred user did something that can count toward their referral.
     *
     * `kind` is "purchase" when they bought as a customer, or "partner_job" when
     * they completed work as a driver or merchant. The first qualifying event
     * settles which programme the link is on, and it never changes afterwards:
     *
     *  - a plain buyer lands on CUSTOMER and pays out on that single purchase
     *  - a driver or merchant lands on PARTNER and pays out once they have
     *    completed the configured number of trips or orders
     *
     * A partner's own shopping therefore does not shortcut the partner bar, and
     * a buyer is never held to it. Idempotent and non-fatal.
     */
    async recordQualifyingActivity(referredUserId: string, kind: "purchase" | "partner_job"): Promise<void> {
        try {
            const link = await this.linkRepo.findOne({ where: { referredId: referredUserId, status: ReferralStatus.PENDING } });
            if (!link) return;

            // Settle the programme on the first qualifying event.
            if (link.program === ReferralProgram.UNDECIDED) {
                const partner = await this.isPartner(referredUserId);
                const rewards = await this.rewardsForWalletOf(link.referrerId);
                if (partner) {
                    link.program = ReferralProgram.PARTNER;
                    link.requiredProgress = rewards.partnerThreshold;
                    link.rewardAmount = rewards.partner;
                } else {
                    link.program = ReferralProgram.CUSTOMER;
                    link.requiredProgress = 1;
                    link.rewardAmount = rewards.referrer;
                }
            }

            // Only the matching kind of work moves the needle.
            const counts = link.program === ReferralProgram.PARTNER
                ? kind === "partner_job"
                : kind === "purchase";
            if (!counts) {
                await this.linkRepo.save(link);
                return;
            }

            link.progress = Number(link.progress || 0) + 1;
            if (link.progress < link.requiredProgress) {
                await this.linkRepo.save(link);
                log.info("Referral progress recorded", { referredUserId, program: link.program, progress: link.progress, required: link.requiredProgress });
                return;
            }

            link.status = ReferralStatus.COMPLETED;
            link.completedAt = new Date();
            await this.linkRepo.save(link);

            const referrer = await this.userRepo.findOne({ where: { id: link.referrerId } });
            const referrerAmount = Number(link.rewardAmount || 0);
            const refereeRewards = await this.rewardsForWalletOf(referredUserId);
            const refereeAmount = link.program === ReferralProgram.PARTNER ? refereeRewards.partner : refereeRewards.referee;

            const why = link.program === ReferralProgram.PARTNER
                ? `completed ${link.requiredProgress} trips or orders`
                : "made their first purchase";

            await this.creditWalletSafe(link.referrerId, referrerAmount, referrer?.country || "GH", `Referral reward - your invite ${why}`, { type: "referral_referrer", program: link.program, referredId: referredUserId });
            await this.creditWalletSafe(referredUserId, refereeAmount, referrer?.country || "GH", "Referral bonus unlocked", { type: "referral_referee", program: link.program, referrerId: link.referrerId });

            await this.notifications
                .notify(link.referrerId, NotificationType.WALLET_CREDITED, "Referral reward earned", `You earned ${referrerAmount} in-app credit because your invite ${why}.`, {})
                .catch(() => {});
            await this.notifications
                .notify(referredUserId, NotificationType.WALLET_CREDITED, "Referral bonus unlocked", `Your ${refereeAmount} referral credit is now in your wallet for in-app use.`, {})
                .catch(() => {});
            log.info("Referral rewards paid", { referrerId: link.referrerId, referredUserId, program: link.program, referrerAmount, refereeAmount });
        } catch (e) {
            log.warn("recordQualifyingActivity failed (non-fatal)", { referredUserId, error: (e as Error).message });
        }
    }

    /** The referee bought something. Kept as the name the order/ride services already call. */
    async rewardReferrerOnFirstCompletion(referredUserId: string): Promise<void> {
        await this.recordQualifyingActivity(referredUserId, "purchase");
    }

    /** A referred driver finished a trip or delivery, or a referred merchant fulfilled an order. */
    async recordPartnerJob(referredUserId: string | null | undefined): Promise<void> {
        if (!referredUserId) return;
        await this.recordQualifyingActivity(referredUserId, "partner_job");
    }

    /** All referral credit is promo/non-withdrawable: spendable in-app, excluded from payouts. */
    private async creditWalletSafe(userId: string, amount: number, country: string, description: string, metadata: Record<string, any>) {
        if (!amount || amount <= 0) return;
        let w = await this.wallet.getWallet(userId);
        if (!w) w = await this.wallet.createWallet(userId, country);
        await this.wallet.credit(userId, amount, description, metadata, true); // promo: non-withdrawable
    }
}
