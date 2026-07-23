import { PaymentService } from "../src/services/payment/payment-service";
import { PaymentRecordStatus } from "../src/models/payment";

/**
 * Guards the "package payment taken but never confirmed" fix. Confirmation must not
 * depend solely on a webhook/browser callback (which can be delayed or missed, especially
 * for mobile money): the status poll re-verifies, and the unpaid-ride reaper verifies
 * before cancelling so a paid ride is never reaped.
 */

describe("confirmPayment poll mode (failOnNonSuccess=false)", () => {
    function makeService(verifySuccess: boolean, providerStatus: string) {
        const svc = new PaymentService();
        const payment: any = { id: "p1", status: PaymentRecordStatus.PENDING, metadata: { reference: "R1" }, userId: "u1", amount: 10, currency: "GHS" };
        (svc as any).getPaymentByReference = jest.fn().mockResolvedValue(payment);
        (svc as any).paymentRepo = { save: jest.fn().mockImplementation(async (p: any) => p) };
        (svc as any).applyPaymentSideEffects = jest.fn().mockResolvedValue(undefined);
        (svc as any).notificationService = { notify: jest.fn() };
        const verifyPayment = jest.fn().mockResolvedValue({ success: verifySuccess, providerStatus });
        jest.spyOn(require("../src/services/payment/payment-provider-registry").paymentProviderRegistry, "getProvider")
            .mockReturnValue({ verifyPayment });
        return { svc, payment };
    }

    it("promotes to SUCCESS when the gateway reports success", async () => {
        const { svc, payment } = makeService(true, "success");
        await svc.confirmPayment("R1", undefined, false);
        expect(payment.status).toBe(PaymentRecordStatus.SUCCESS);
    });

    it("leaves an in-progress payment PENDING (never a false failure)", async () => {
        const { svc, payment } = makeService(false, "ongoing");
        await svc.confirmPayment("R1", undefined, false);
        expect(payment.status).toBe(PaymentRecordStatus.PENDING);
    });

    it("still marks FAILED in one-shot mode (webhook/callback default)", async () => {
        const { svc, payment } = makeService(false, "failed");
        await svc.confirmPayment("R1"); // default failOnNonSuccess=true
        expect(payment.status).toBe(PaymentRecordStatus.FAILED);
    });
});

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
        // Poll mode: failOnNonSuccess=false so an in-progress payment is never failed.
        expect(confirmPayment).toHaveBeenCalledWith("RIDE-abc", undefined, false);
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
