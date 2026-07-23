import { ScheduledRideService } from "../src/services/scheduled-ride-service";
import { ScheduledRideStatus, ScheduledPaymentStatus } from "../src/models/scheduled-ride";

/**
 * Guards the scheduled-ride payment rules:
 *  - scheduled rides are prepaid: cash (or a missing method) is rejected
 *  - cancelling >3h before pickup is a full refund; within 3h keeps 70% of the fare
 */
describe("scheduled rides", () => {
    describe("create rejects non-prepaid methods", () => {
        const svc = new ScheduledRideService();
        const base = {
            customerId: "c1", pickupAddress: "A", pickupLat: 5.6, pickupLng: -0.1,
            dropoffAddress: "B", dropoffLat: 5.7, dropoffLng: -0.2,
            vehicleType: "car", distanceKm: 4, durationMin: 12,
            scheduledAt: new Date(Date.now() + 6 * 3600_000).toISOString(),
        };

        it("rejects cash", async () => {
            await expect(svc.create({ ...base, paymentMethod: "cash" } as any)).rejects.toThrow(/prepaid/i);
        });

        it("rejects a missing method", async () => {
            await expect(svc.create({ ...base, paymentMethod: undefined } as any)).rejects.toThrow(/prepaid/i);
        });
    });

    describe("cancel refund / late fee", () => {
        function makeService(scheduledAt: Date, paid = 100) {
            const svc = new ScheduledRideService();
            const ride: any = {
                id: "s1", customerId: "c1", status: ScheduledRideStatus.SCHEDULED,
                paymentStatus: ScheduledPaymentStatus.PAID, estimatedFare: paid, scheduledAt,
            };
            (svc as any).repo = {
                findOne: jest.fn().mockResolvedValue(ride),
                save: jest.fn().mockImplementation(async (r: any) => r),
            };
            // Echo back exactly what cancel asks to refund.
            (svc as any).paymentService = {
                refundScheduledRidePayment: jest.fn().mockImplementation(async (_id: string, amt?: number) => amt ?? paid),
            };
            return { svc, ride };
        }

        it("full refund when cancelling more than 3h before pickup", async () => {
            const { svc } = makeService(new Date(Date.now() + 5 * 3600_000));
            const res = await svc.cancel("s1", "c1");
            expect(res.late).toBe(false);
            expect(res.refunded).toBe(100);
            expect(res.feeKept).toBe(0);
        });

        it("keeps 70% when cancelling within 3h of pickup", async () => {
            const { svc } = makeService(new Date(Date.now() + 1 * 3600_000), 100);
            const res = await svc.cancel("s1", "c1");
            expect(res.late).toBe(true);
            expect(res.refunded).toBe(30);
            expect(res.feeKept).toBe(70);
        });

        it("is a no-op on an already-cancelled ride", async () => {
            const { svc, ride } = makeService(new Date(Date.now() + 1 * 3600_000));
            ride.status = ScheduledRideStatus.CANCELLED;
            const res = await svc.cancel("s1", "c1");
            expect(res.refunded).toBe(0);
            expect(res.feeKept).toBe(0);
        });
    });
});
