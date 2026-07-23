import { PaymentService } from "../src/services/payment/payment-service";
import { PaymentRecordStatus } from "../src/models/payment";

/**
 * Guards the "package payment taken but never confirmed" fix. Confirmation must not
 * depend solely on a webhook/browser callback (which can be delayed or missed, especially
 * for mobile money): the status poll re-verifies, and the unpaid-ride reaper verifies
 * before cancelling so a paid ride is never reaped.
 */
describe("confirmRideIfPaid", () => {
    function makeService(payment: any, confirmResult: any) {
        const svc = new PaymentService();
        (svc as any).paymentRepo = { findOne: jest.fn().mockResolvedValue(payment) };
        const confirmPayment = jest.fn().mockResolvedValue(confirmResult);
        (svc as any).confirmPayment = confirmPayment;
        return { svc, confirmPayment };
    }

    it("returns true and confirms when the pending payment actually succeeded", async () => {
        const { svc, confirmPayment } = makeService(
            { rideId: "r1", status: PaymentRecordStatus.PENDING, metadata: { reference: "RIDE-abc" } },
            { status: PaymentRecordStatus.SUCCESS },
        );
        await expect(svc.confirmRideIfPaid("r1")).resolves.toBe(true);
        expect(confirmPayment).toHaveBeenCalledWith("RIDE-abc");
    });

    it("returns false when the payment is still unpaid (abandoned)", async () => {
        const { svc } = makeService(
            { rideId: "r1", status: PaymentRecordStatus.PENDING, metadata: { reference: "RIDE-abc" } },
            { status: PaymentRecordStatus.PENDING },
        );
        await expect(svc.confirmRideIfPaid("r1")).resolves.toBe(false);
    });

    it("returns false when there is no pending payment or reference", async () => {
        const { svc, confirmPayment } = makeService(null, null);
        await expect(svc.confirmRideIfPaid("r1")).resolves.toBe(false);
        expect(confirmPayment).not.toHaveBeenCalled();
    });
});
