import { validatePhoneNumber } from "../src/utils/phone-validator";

/**
 * Guards the phone-format auth failure: 81% of production users have their number
 * stored WITHOUT the leading "+" (e.g. 233500647090). Those numbers must validate so
 * the owner can use authed endpoints, while genuinely invalid input still fails.
 */
describe("validatePhoneNumber", () => {
    it("accepts a proper E.164 number", () => {
        const r = validatePhoneNumber("+233500647090");
        expect(r.valid).toBe(true);
        expect(r.formatted).toBe("+233500647090");
    });

    it("accepts a bare international number missing the plus (the common stored form)", () => {
        const r = validatePhoneNumber("233500647090");
        expect(r.valid).toBe(true);
        expect(r.formatted).toBe("+233500647090");
    });

    it("normalizes a bare number with spaces/dashes", () => {
        const r = validatePhoneNumber("233 50 064 7090");
        expect(r.valid).toBe(true);
        expect(r.formatted).toBe("+233500647090");
    });

    it("accepts a bare Nigerian number", () => {
        const r = validatePhoneNumber("2348012345678");
        expect(r.valid).toBe(true);
        expect(r.formatted).toBe("+2348012345678");
    });

    it("normalizes a Ghana local number (leading 0) via the default market", () => {
        // Legacy accounts store national-format numbers (leading 0). These must resolve
        // against the app's markets so their owners can use authed endpoints.
        const r = validatePhoneNumber("0536690447");
        expect(r.valid).toBe(true);
        expect(r.formatted).toBe("+233536690447");
    });

    it("rejects obvious garbage", () => {
        expect(validatePhoneNumber("hello").valid).toBe(false);
        expect(validatePhoneNumber("").valid).toBe(false);
        expect(validatePhoneNumber("12").valid).toBe(false);
    });

    it("honours an explicit country code without forcing a plus", () => {
        const r = validatePhoneNumber("0500647090", "GH");
        expect(r.valid).toBe(true);
        expect(r.formatted).toBe("+233500647090");
    });
});
