import { CheckoutService } from "../src/services/checkout-service";
import { RideType } from "../src/models/ride";

/**
 * Guards the package "payment keeps buffering" fix: the package checkout MUST forward
 * the sender's phone to requestRide, or mobile money throws "Phone number is required"
 * and the Paystack page never opens. Also confirms the gateway fields are lifted to the
 * top level so the payment webview always has a matching reference.
 */
describe("package_ride checkout forwards sender contact", () => {
    function makeService() {
        const svc = new CheckoutService();
        const requestRide = jest.fn().mockImplementation(async (req: any) => ({
            id: "r1", type: req.type, status: "awaiting_payment",
            authorizationUrl: "https://paystack/checkout/xyz",
            paymentReference: "PKG-123",
        }));
        (svc as any).rideService = { requestRide };
        return { svc, requestRide };
    }

    const input = {
        kind: "package_ride" as const,
        pickupAddress: "A", pickupLat: 5.6, pickupLng: -0.1,
        dropoffAddress: "B", dropoffLat: 5.7, dropoffLng: -0.2,
        vehicleType: "car" as any, distanceKm: 4, durationMin: 12,
        paymentMethod: "momo",
        phoneNumber: "+233500647090",
        email: "sender@velo.app",
    };

    it("passes the sender phone and email into requestRide", async () => {
        const { svc, requestRide } = makeService();
        await svc.checkout("user-1", input as any);
        const arg = requestRide.mock.calls[0][0];
        expect(arg.type).toBe(RideType.DELIVERY);
        expect(arg.phoneNumber).toBe("+233500647090");
        expect(arg.email).toBe("sender@velo.app");
        expect(arg.paymentMethod).toBe("momo");
    });

    it("lifts authorizationUrl and paymentReference to the top level", async () => {
        const { svc } = makeService();
        const res: any = await svc.checkout("user-1", input as any);
        expect(res.authorizationUrl).toBe("https://paystack/checkout/xyz");
        expect(res.paymentReference).toBe("PKG-123");
        expect(res.ride.authorizationUrl).toBe("https://paystack/checkout/xyz");
    });
});
