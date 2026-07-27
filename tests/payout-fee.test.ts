import { paystackTransferFee, payoutBreakdown } from "../src/utils/payout-fee";

/**
 * On-demand payout fee: the recipient gets (gross - fee), the wallet is debited the
 * gross, and Paystack charges the fee from our balance (net-neutral). These guard the
 * tiers and the breakdown the app shows before a user confirms.
 */
describe("paystackTransferFee", () => {
    it("uses NGN tiers", () => {
        expect(paystackTransferFee(5000, "NGN")).toBe(10);
        expect(paystackTransferFee(5001, "NGN")).toBe(25);
        expect(paystackTransferFee(50000, "NGN")).toBe(25);
        expect(paystackTransferFee(50001, "NGN")).toBe(50);
    });

    it("uses a capped percentage for GHS", () => {
        expect(paystackTransferFee(100, "GHS")).toBeCloseTo(1, 2); // 1% of 100
        expect(paystackTransferFee(100000, "GHS")).toBe(10); // capped
    });
});

describe("payoutBreakdown", () => {
    it("net = gross - fee, wallet debit is the gross", () => {
        const b = payoutBreakdown(5000, "NGN");
        expect(b.gross).toBe(5000);
        expect(b.fee).toBe(10);
        expect(b.net).toBe(4990);
        expect(b.currency).toBe("NGN");
    });
});
