import { PaymentController } from "../src/controllers/PaymentController";
import { PaymentService } from "../src/services/payment/payment-service";
import { ServiceBookingService } from "../src/services/service-booking-service";
import { ServiceBookingStatus, ServicePaymentStatus } from "../src/models/service-booking";
import { DeliveryService } from "../src/services/delivery-service";
import { OrderStatus } from "../src/models/order";

/**
 * Round 23 regressions:
 *  - Paystack webhook: the raw express.raw Buffer must be hashed as its utf8 string,
 *    not JSON.stringify(Buffer), or the HMAC never matches and payments never confirm.
 *  - Currency: a non-GHS charge on the GHS-only account must convert to GHS, not be
 *    sent through and rejected with "Currency not supported by merchant".
 *  - completeBooking is idempotent (already-settled returns success, not an error) and
 *    delegates completion to settlement.
 *  - getActiveDelivery excludes terminal statuses so a finished job never re-hydrates.
 */

describe("PaymentController.handleWebhook raw body", () => {
    function makeReqRes(body: any) {
        const req: any = { headers: { "x-paystack-signature": "sig" }, body };
        const res: any = { statusCode: 0, status(c: number) { this.statusCode = c; return this; }, json() { return this; } };
        return { req, res };
    }

    it("passes the raw utf8 string (not the JSON of a Buffer) to the service", async () => {
        const controller = new PaymentController();
        const raw = JSON.stringify({ event: "charge.success", data: { reference: "R1" } });
        const spy = jest.spyOn((controller as any).paymentService, "handleWebhook").mockResolvedValue(undefined as any);
        const { req, res } = makeReqRes(Buffer.from(raw, "utf8"));

        await controller.handleWebhook(req, res);

        expect(spy).toHaveBeenCalledWith(raw, "sig");
        // Guard against the regression: the payload must not be the Buffer JSON shape.
        expect(spy.mock.calls[0][0]).not.toContain('"type":"Buffer"');
    });
});

describe("PaymentService.gatewayCharge currency conversion", () => {
    function makeService(rates: Record<string, number>) {
        const svc = new PaymentService();
        (svc as any).settingsRepo = {
            findOne: jest.fn(async ({ where }: any) => {
                const r = rates[where.currency];
                return r != null ? { usdExchangeRate: r, currency: where.currency } : null;
            }),
        };
        return svc;
    }

    it("charges GHS as-is (supported by the account)", async () => {
        const svc = makeService({ GHS: 15.5 });
        const charge = await (svc as any).gatewayCharge(100, "GHS");
        expect(charge.converted).toBe(false);
        expect(charge.currency).toBe("GHS");
        expect(charge.amount).toBe(100);
    });

    it("converts NGN to GHS using the usd cross-rate", async () => {
        // NGN=1550/USD, GHS=15.5/USD -> 100 per GHS -> 6300 NGN => 63 GHS
        const svc = makeService({ NGN: 1550, GHS: 15.5 });
        const charge = await (svc as any).gatewayCharge(6300, "NGN");
        expect(charge.converted).toBe(true);
        expect(charge.currency).toBe("GHS");
        expect(charge.amount).toBeCloseTo(63, 2);
    });
});

describe("ServiceBookingService.completeBooking idempotency", () => {
    function makeService(booking: any) {
        const svc = new ServiceBookingService();
        (svc as any).bookingRepo = {
            findOne: jest.fn().mockResolvedValue(booking),
            save: jest.fn().mockImplementation(async (b: any) => b),
        };
        const settleServiceBooking = jest.fn().mockResolvedValue({});
        (svc as any).settlementService = { settleServiceBooking };
        (svc as any).notificationService = { notify: jest.fn().mockResolvedValue(undefined) };
        return { svc, settleServiceBooking };
    }

    it("returns success without re-settling when already completed AND paid", async () => {
        const booking: any = { id: "b1", merchantId: "m1", completionCode: "AB12", status: ServiceBookingStatus.COMPLETED, paymentStatus: ServicePaymentStatus.PAID };
        const { svc, settleServiceBooking } = makeService(booking);
        await expect(svc.completeBooking("b1", "m1", "ab12")).resolves.toBe(booking);
        expect(settleServiceBooking).not.toHaveBeenCalled();
    });

    it("retries settlement when completed but not yet settled", async () => {
        const booking: any = { id: "b1", merchantId: "m1", completionCode: "AB12", status: ServiceBookingStatus.COMPLETED, paymentStatus: ServicePaymentStatus.PENDING };
        const { svc, settleServiceBooking } = makeService(booking);
        await svc.completeBooking("b1", "m1", "AB12");
        expect(settleServiceBooking).toHaveBeenCalledWith("b1", "m1", "merchant");
    });

    it("rejects a wrong completion code", async () => {
        const booking: any = { id: "b1", merchantId: "m1", completionCode: "AB12", status: ServiceBookingStatus.IN_PROGRESS, paymentStatus: ServicePaymentStatus.PAID };
        const { svc, settleServiceBooking } = makeService(booking);
        await expect(svc.completeBooking("b1", "m1", "ZZZZ")).rejects.toThrow("Invalid completion code");
        expect(settleServiceBooking).not.toHaveBeenCalled();
    });
});

describe("DeliveryService.getActiveDelivery excludes terminal statuses", () => {
    it("queries with a status NOT IN (delivered, completed, cancelled) filter", async () => {
        const svc = new DeliveryService();
        const findOne = jest.fn().mockResolvedValue(null);
        (svc as any).orderRepo = { findOne };
        await svc.getActiveDelivery("driver-1");
        const arg = findOne.mock.calls[0][0];
        expect(arg.where.driverId).toBe("driver-1");
        // The TypeORM Not(In([...])) operator carries the excluded values in _value.
        const excluded = arg.where.status?._value?._value;
        expect(excluded).toEqual(expect.arrayContaining([OrderStatus.DELIVERED, OrderStatus.COMPLETED, OrderStatus.CANCELLED]));
    });
});
