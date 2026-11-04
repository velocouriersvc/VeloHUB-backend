/**
 * Unit tests for the two referral programmes.
 *
 * The thing worth pinning is which programme a link lands on and what it takes
 * to pay out, because getting it wrong either pays a partner the small customer
 * reward on their first sandwich, or holds a plain buyer to a ten-job bar they
 * will never clear.
 *
 * All TypeORM repos are replaced on the service instance so no database is needed.
 */

import { ReferralService } from "../src/services/referral-service";
import { ReferralStatus, ReferralProgram } from "../src/models/referral-link";

const REFERRER = "referrer-1";
const REFEREE = "referee-1";

function buildService(opts: { isPartner: boolean; link?: any }) {
    const svc = new ReferralService();
    const link = opts.link ?? {
        id: "link-1",
        referrerId: REFERRER,
        referredId: REFEREE,
        referralCodeString: "ABC123",
        status: ReferralStatus.PENDING,
        program: ReferralProgram.UNDECIDED,
        progress: 0,
        requiredProgress: 1,
        rewardAmount: 0,
        completedAt: null,
    };

    const saved: any[] = [];
    (svc as any).linkRepo = {
        findOne: jest.fn().mockResolvedValue(link),
        save: jest.fn().mockImplementation(async (e: any) => { saved.push({ ...e }); return e; }),
    };
    (svc as any).userRepo = {
        findOne: jest.fn().mockResolvedValue({ id: REFERRER, country: "GH" }),
        // isPartner() asks the DB whether the referee holds a driver/merchant role.
        query: jest.fn().mockResolvedValue(opts.isPartner ? [{ "?column?": 1 }] : []),
    };
    (svc as any).settingsRepo = {
        findOne: jest.fn().mockResolvedValue({
            currency: "GHS",
            referralRewardAmount: 5,
            referralRefereeReward: 10,
            partnerReferralRewardAmount: 25,
            partnerReferralThreshold: 10,
        }),
    };
    (svc as any).wallet = { getWallet: jest.fn().mockResolvedValue({ currency: "GHS" }), createWallet: jest.fn() };
    (svc as any).notifications = { notify: jest.fn().mockResolvedValue(undefined) };

    const credits: any[] = [];
    (svc as any).creditWalletSafe = jest.fn().mockImplementation(async (userId: string, amount: number) => {
        credits.push({ userId, amount });
    });

    return { svc, link, credits };
}

describe("a referred buyer", () => {
    it("settles on the customer programme and pays out on the first purchase", async () => {
        const { svc, link, credits } = buildService({ isPartner: false });

        await svc.recordQualifyingActivity(REFEREE, "purchase");

        expect(link.program).toBe(ReferralProgram.CUSTOMER);
        expect(link.requiredProgress).toBe(1);
        expect(link.status).toBe(ReferralStatus.COMPLETED);
        expect(credits).toEqual([
            { userId: REFERRER, amount: 5 },
            { userId: REFEREE, amount: 10 },
        ]);
    });
});

describe("a referred driver or merchant", () => {
    it("settles on the partner programme and is not paid by a single purchase", async () => {
        const { svc, link, credits } = buildService({ isPartner: true });

        await svc.recordQualifyingActivity(REFEREE, "purchase");

        expect(link.program).toBe(ReferralProgram.PARTNER);
        expect(link.requiredProgress).toBe(10);
        // Their own shopping must not shortcut the partner bar.
        expect(link.progress).toBe(0);
        expect(link.status).toBe(ReferralStatus.PENDING);
        expect(credits).toEqual([]);
    });

    it("pays both sides only on the tenth qualifying job", async () => {
        const { svc, link, credits } = buildService({ isPartner: true });

        for (let i = 1; i <= 9; i++) {
            await svc.recordQualifyingActivity(REFEREE, "partner_job");
            expect(link.progress).toBe(i);
            expect(link.status).toBe(ReferralStatus.PENDING);
            expect(credits).toEqual([]);
        }

        await svc.recordQualifyingActivity(REFEREE, "partner_job");

        expect(link.progress).toBe(10);
        expect(link.status).toBe(ReferralStatus.COMPLETED);
        expect(link.completedAt).toBeInstanceOf(Date);
        expect(credits).toEqual([
            { userId: REFERRER, amount: 25 },
            { userId: REFEREE, amount: 25 },
        ]);
    });
});

describe("payout safety", () => {
    it("does nothing when there is no pending link", async () => {
        const { svc, credits } = buildService({ isPartner: false });
        (svc as any).linkRepo.findOne = jest.fn().mockResolvedValue(null);

        await svc.recordQualifyingActivity(REFEREE, "purchase");

        expect(credits).toEqual([]);
    });

    it("never pays a link twice, because only PENDING links are looked up", async () => {
        const { svc, credits } = buildService({ isPartner: false });
        await svc.recordQualifyingActivity(REFEREE, "purchase");
        expect(credits).toHaveLength(2);

        // Once completed, the PENDING lookup returns nothing on any later event.
        (svc as any).linkRepo.findOne = jest.fn().mockResolvedValue(null);
        await svc.recordQualifyingActivity(REFEREE, "purchase");
        await svc.recordQualifyingActivity(REFEREE, "partner_job");

        expect(credits).toHaveLength(2);
    });

    it("ignores a partner job from someone with no referral", async () => {
        const { svc, credits } = buildService({ isPartner: true });
        (svc as any).linkRepo.findOne = jest.fn().mockResolvedValue(null);

        await svc.recordPartnerJob(REFEREE);
        await svc.recordPartnerJob(null);
        await svc.recordPartnerJob(undefined);

        expect(credits).toEqual([]);
    });

    it("keeps rewardReferrerOnFirstCompletion working as the purchase entry point", async () => {
        const { svc, link, credits } = buildService({ isPartner: false });

        await svc.rewardReferrerOnFirstCompletion(REFEREE);

        expect(link.program).toBe(ReferralProgram.CUSTOMER);
        expect(credits).toHaveLength(2);
    });
});
