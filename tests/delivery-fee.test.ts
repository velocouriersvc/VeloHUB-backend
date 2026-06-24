import { DeliveryFeeService } from "../src/services/delivery-fee-service";
import { PricingVertical } from "../src/config/pricing";

/**
 * Guards the fix for "Delivery Fee / Service Fee not working": a merchant without
 * a saved location must NOT throw (which previously 500'd the whole quote and
 * hid both fees). It should fall back to a base-only delivery fee.
 */
describe("DeliveryFeeService resilience", () => {
    const settings = { deliveryBaseFee: 50, deliveryPerKmFee: 10, driverDeliveryFeeShare: 75 };

    function makeService(merchant: any) {
        const svc = new DeliveryFeeService();
        (svc as any).merchantRepo = { findOne: jest.fn().mockResolvedValue(merchant) };
        (svc as any).settingsRepo = { findOne: jest.fn().mockResolvedValue(settings) };
        return svc;
    }

    it("falls back to a base-only fee when the merchant is missing (no throw)", async () => {
        const svc = makeService(null);
        const res = await svc.calculateDeliveryFee("m1", 5.6, -0.1, "GH");
        expect(res.locationResolved).toBe(false);
        expect(res.distanceKm).toBe(0);
        // No category -> marketplace vertical -> base * 0.7, distance 0
        expect(res.vertical).toBe(PricingVertical.MARKETPLACE);
        expect(res.deliveryFee).toBe(35);
    });

    it("falls back to base-only when merchant has no coordinates (no throw)", async () => {
        const svc = makeService({ category: "grocery", latitude: null, longitude: null });
        const res = await svc.calculateDeliveryFee("m1", 5.6, -0.1, "GH");
        expect(res.locationResolved).toBe(false);
        expect(res.distanceKm).toBe(0);
        // grocery -> food vertical -> base * 0.8
        expect(res.vertical).toBe(PricingVertical.FOOD);
        expect(res.deliveryFee).toBe(40);
    });

    it("computes a distance-based fee when the location is present", async () => {
        const svc = makeService({ category: "restaurant", latitude: 5.6052, longitude: -0.1668 });
        const res = await svc.calculateDeliveryFee("m1", 5.67, -0.0166, "GH");
        expect(res.locationResolved).toBe(true);
        expect(res.vertical).toBe(PricingVertical.FOOD);
        expect(res.distanceKm).toBeGreaterThan(0);
        expect(res.deliveryFee).toBeGreaterThan(40); // base(40) + distance component
    });

    it("honours an explicitly pinned vertical", async () => {
        const svc = makeService({ category: "restaurant", latitude: null, longitude: null });
        const res = await svc.calculateDeliveryFee("m1", 5.6, -0.1, "GH", PricingVertical.PACKAGE);
        expect(res.vertical).toBe(PricingVertical.PACKAGE);
        // package -> base * 1.2, distance 0
        expect(res.deliveryFee).toBe(60);
    });
});
