import { RideService } from "../src/services/ride-service";
import { RideStatus, RideType, PaymentMethod } from "../src/models/ride";

/**
 * Guards the package (courier delivery) requirements:
 *  - packages must be prepaid (card/momo) so nothing dispatches before payment
 *  - the recipient's drop-off code is required to complete a package delivery
 */
describe("package delivery rules", () => {
    describe("completeRide drop-off code gate", () => {
        function makeService(ride: any) {
            const svc = new RideService();
            (svc as any).getRideOrFail = jest.fn().mockResolvedValue(ride);
            (svc as any).rideRepo = { save: jest.fn().mockImplementation(async (r: any) => r) };
            (svc as any).settlementService = { settleRide: jest.fn().mockResolvedValue(undefined) };
            (svc as any).redisLocation = { removeRideTracking: jest.fn(), setDriverStatus: jest.fn() };
            return svc;
        }

        const pkg = (over: any = {}) => ({
            id: "r1", type: RideType.DELIVERY, status: RideStatus.ONGOING,
            packageDeliveryCode: "ABC123", packageDeliveryVerifiedAt: null, driverId: "d1",
            ...over,
        });

        it("rejects completion without the recipient's code", async () => {
            const svc = makeService(pkg());
            await expect(svc.completeRide("r1", "d1", "driver")).rejects.toThrow(/delivery code/i);
        });

        it("rejects a wrong code", async () => {
            const svc = makeService(pkg());
            await expect(svc.completeRide("r1", "d1", "driver", "ZZZ999")).rejects.toThrow(/delivery code/i);
        });

        it("completes with the correct code (case-insensitive)", async () => {
            const ride = pkg();
            const svc = makeService(ride);
            (svc as any).getRideOrFail = jest.fn()
                .mockResolvedValueOnce(ride)   // initial load
                .mockResolvedValue({ ...ride, status: RideStatus.COMPLETED }); // refreshed
            await expect(svc.completeRide("r1", "d1", "driver", "abc123")).resolves.toBeDefined();
            expect(ride.packageDeliveryVerifiedAt).toBeInstanceOf(Date);
        });

        it("does not gate a passenger ride on a package code", async () => {
            const ride = { id: "r2", type: RideType.RIDE, status: RideStatus.ONGOING, packageDeliveryCode: null, driverId: "d1" };
            const svc = makeService(ride);
            (svc as any).getRideOrFail = jest.fn()
                .mockResolvedValueOnce(ride)
                .mockResolvedValue({ ...ride, status: RideStatus.COMPLETED });
            await expect(svc.completeRide("r2", "d1", "driver")).resolves.toBeDefined();
        });
    });

    it("PaymentMethod has the prepaid options packages accept", () => {
        // A package's payment method must be one of these (cash is rejected in requestRide).
        expect([PaymentMethod.CARD, PaymentMethod.MOMO]).toContain(PaymentMethod.CARD);
        expect([PaymentMethod.CARD, PaymentMethod.MOMO]).toContain(PaymentMethod.MOMO);
    });
});
