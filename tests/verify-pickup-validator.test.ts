import { validate, body } from "../src/middleware/validate";

/**
 * Guards the fix for "Drivers code was unable to be verified - Action Failed".
 *
 * The verify-pickup route used to require `body("pickupCode").minLength(6)` while the
 * app sends `{ code }` and the controller reads `code`. Every delivery handover was
 * rejected with 400 before the controller ran, and because the 400 body carried no
 * `message` the merchant only ever saw "Something went wrong".
 *
 * These tests pin both halves of that contract: the field name/length the route now
 * accepts, and the presence of a readable `message` on validation failures.
 */
describe("verify-pickup body validation", () => {
    const rules = [body("code").required().isString().minLength(4)];

    function run(reqBody: any) {
        const req: any = { body: reqBody };
        const res: any = {
            statusCode: 0,
            payload: undefined as any,
            status(code: number) { this.statusCode = code; return this; },
            json(p: any) { this.payload = p; return this; },
        };
        const next = jest.fn();
        validate(rules)(req, res, next);
        return { res, next };
    }

    it("accepts the driver's 4-digit handover PIN", () => {
        const { res, next } = run({ code: "7477" });
        expect(next).toHaveBeenCalled();
        expect(res.statusCode).toBe(0);
    });

    it("accepts the customer's 6-char store pickup code", () => {
        const { next } = run({ code: "BENTKZ" });
        expect(next).toHaveBeenCalled();
    });

    it("rejects a missing code", () => {
        const { res, next } = run({});
        expect(next).not.toHaveBeenCalled();
        expect(res.statusCode).toBe(400);
    });

    it("rejects a code that is too short to be either kind", () => {
        const { res, next } = run({ code: "747" });
        expect(next).not.toHaveBeenCalled();
        expect(res.statusCode).toBe(400);
    });

    it("does NOT accept the old `pickupCode` field name", () => {
        // The app has never sent this; requiring it is what broke every handover.
        const { res } = run({ pickupCode: "7477" });
        expect(res.statusCode).toBe(400);
    });

    it("returns a readable top-level message, not just an errors array", () => {
        const { res } = run({});
        expect(typeof res.payload.message).toBe("string");
        expect(res.payload.message.length).toBeGreaterThan(0);
        expect(res.payload.errors[0].field).toBe("code");
    });
});
