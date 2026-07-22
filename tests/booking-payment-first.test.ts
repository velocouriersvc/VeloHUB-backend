import { ServiceBookingService } from "../src/services/service-booking-service";
import { ServiceBookingStatus } from "../src/models/service-booking";

/**
 * Guards "payment must be made before service requests are sent to merchants".
 *
 * Bookings are created AWAITING_PAYMENT and are invisible to the provider. Only a
 * confirmed payment promotes them to REQUESTED and notifies the merchant, and that
 * promotion must be idempotent because payment webhooks can be replayed.
 */
describe("service booking payment-first flow", () => {
    function makeService(bookings: any[]) {
        const svc = new ServiceBookingService();
        const saved: any[] = [];
        (svc as any).bookingRepo = {
            find: jest.fn().mockResolvedValue(bookings),
            save: jest.fn().mockImplementation(async (rows: any) => { saved.push(rows); return rows; }),
        };
        (svc as any).userRepo = { findOne: jest.fn().mockResolvedValue({ id: "cust-1", buyerProfile: { fullName: "Ama" } }) };
        (svc as any).productRepo = { findOne: jest.fn().mockResolvedValue({ serviceDurationMin: 45 }) };
        const notify = jest.fn().mockResolvedValue(undefined);
        (svc as any).notificationService = { notify };
        return { svc, notify, saved };
    }

    const booking = (over: any = {}) => ({
        id: "b1", bookingNumber: "SB-1", customerId: "cust-1", merchantId: "merch-1",
        productId: "p1", serviceTitle: "Haircut", serviceAddress: "12 Main St",
        preferredDate: "2026-08-01T00:00:00.000Z",
        status: ServiceBookingStatus.AWAITING_PAYMENT,
        ...over,
    });

    it("promotes an unpaid booking to REQUESTED and notifies the merchant", async () => {
        const rows = [booking()];
        const { svc, notify } = makeService(rows);

        await svc.applyBookingPaidSideEffects(["b1"]);

        expect(rows[0].status).toBe(ServiceBookingStatus.REQUESTED);
        // Merchant is told first, then the customer gets a confirmation.
        expect(notify).toHaveBeenCalledTimes(2);
        expect(notify.mock.calls[0][0]).toBe("merch-1");
        expect(notify.mock.calls[1][0]).toBe("cust-1");
    });

    it("is idempotent: a replayed webhook does not re-notify", async () => {
        const rows = [booking({ status: ServiceBookingStatus.REQUESTED })];
        const { svc, notify } = makeService(rows);

        await svc.applyBookingPaidSideEffects(["b1"]);

        expect(notify).not.toHaveBeenCalled();
    });

    it("does nothing when given no booking ids", async () => {
        const { svc, notify } = makeService([]);
        await svc.applyBookingPaidSideEffects([]);
        expect(notify).not.toHaveBeenCalled();
    });

    it("promotes every date of a multi-date booking but notifies once", async () => {
        const rows = [booking({ id: "b1" }), booking({ id: "b2", preferredDate: "2026-08-02T00:00:00.000Z" })];
        const { svc, notify } = makeService(rows);

        await svc.applyBookingPaidSideEffects(["b1", "b2"]);

        expect(rows.every((r) => r.status === ServiceBookingStatus.REQUESTED)).toBe(true);
        expect(notify).toHaveBeenCalledTimes(2); // one merchant + one customer, not per date
    });

    it("reaps unpaid bookings without refunding (nothing was captured)", async () => {
        const rows = [booking(), booking({ id: "b2" })];
        const svc = new ServiceBookingService();
        (svc as any).bookingRepo = {
            find: jest.fn().mockResolvedValue(rows),
            save: jest.fn().mockResolvedValue(rows),
        };
        const refundSpy = jest.spyOn(svc as any, "refundBooking");

        const count = await svc.reapUnpaidBookings(15);

        expect(count).toBe(2);
        expect(rows.every((r) => r.status === ServiceBookingStatus.CANCELLED)).toBe(true);
        expect(refundSpy).not.toHaveBeenCalled();
    });
});
