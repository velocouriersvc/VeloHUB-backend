import {
    payoutRailFor,
    isPaystackPayoutCountry,
    PAYSTACK_PAYOUT_COUNTRIES,
    PAYSTACK_PAYOUT_CURRENCIES,
} from "../src/config/payout-rails";

/**
 * Which rail pays a user out. Paystack Transfers only reach the African
 * markets Paystack settles in; everyone else is paid through Stripe Connect.
 * Getting this wrong is what put a US user in front of a Paystack bank picker
 * they could not use, so it is pinned here.
 */
describe("payoutRailFor", () => {
    it("routes Paystack's payout markets to Paystack", () => {
        for (const country of PAYSTACK_PAYOUT_COUNTRIES) {
            expect(payoutRailFor(country)).toBe("paystack");
        }
    });

    it("routes the US, Canada and Europe to Stripe", () => {
        for (const country of ["US", "CA", "GB", "DE", "FR", "NL", "AU"]) {
            expect(payoutRailFor(country)).toBe("stripe");
        }
    });

    it("routes African countries Paystack cannot pay out to to Stripe", () => {
        // Paystack accepts payments from more of Africa than it can pay out to.
        for (const country of ["TZ", "UG", "RW", "SN", "CM"]) {
            expect(payoutRailFor(country)).toBe("stripe");
        }
    });

    it("falls back to Stripe when the country is unknown", () => {
        expect(payoutRailFor(null)).toBe("stripe");
        expect(payoutRailFor(undefined)).toBe("stripe");
        expect(payoutRailFor("")).toBe("stripe");
        expect(payoutRailFor("ZZ")).toBe("stripe");
    });

    it("is case insensitive", () => {
        expect(payoutRailFor("gh")).toBe("paystack");
        expect(payoutRailFor("us")).toBe("stripe");
        expect(isPaystackPayoutCountry("ng")).toBe(true);
    });

    it("has a payout currency for every Paystack market", () => {
        for (const country of PAYSTACK_PAYOUT_COUNTRIES) {
            expect(PAYSTACK_PAYOUT_CURRENCIES[country]).toBeTruthy();
        }
    });
});
