import {
    computeRideFare,
    computeDeliveryFee,
    clampSurge,
    resolveOrderVertical,
    PricingVertical,
    MAX_SURGE_MULTIPLIER,
    SERVICE_FEE_RATE,
    round2,
} from "../src/config/pricing";

/**
 * These tests pin the Dynamic Fare Architecture to the exact client spec.
 * If any number here drifts, the customer/driver economics have changed.
 */
describe("Dynamic Fare Architecture", () => {
    describe("Ghana baseline (GHS) - 8 km, 15 min standard ride", () => {
        const fare = computeRideFare({
            basePrice: 6.0,
            pricePerKm: 2.2,
            pricePerMin: 0.4,
            distanceKm: 8,
            durationMin: 15,
            minimumFare: 10,
        });

        it("subtotal = 29.60", () => expect(fare.subtotal).toBe(29.6));
        it("service fee (5%) = 1.48", () => expect(fare.serviceFee).toBe(1.48));
        it("rider pays = 31.08", () => expect(fare.finalFare).toBe(31.08));
        it("driver take-home (85%) = 25.16", () => expect(fare.driverPayout).toBe(25.16));
        it("platform take = 5.92", () => expect(fare.platformCommission).toBe(5.92));
        it("commission-only (15%) = 4.44 and excludes the service fee", () => {
            expect(fare.commissionOnly).toBe(4.44);
            // analytics sum (commission + serviceFee) must equal total platform take, no double-count
            expect(round2(fare.commissionOnly + fare.serviceFee)).toBe(fare.platformCommission);
        });
        it("rider total == driver + platform", () =>
            expect(fare.finalFare).toBeCloseTo(fare.driverPayout + fare.platformCommission, 2));
    });

    describe("Nigeria baseline (NGN) - 10 km, 20 min standard ride", () => {
        const fare = computeRideFare({
            basePrice: 400,
            pricePerKm: 110,
            pricePerMin: 20,
            distanceKm: 10,
            durationMin: 20,
            minimumFare: 800,
        });

        it("subtotal = 1900", () => expect(fare.subtotal).toBe(1900));
        it("service fee (5%) = 95", () => expect(fare.serviceFee).toBe(95));
        it("rider pays = 1995", () => expect(fare.finalFare).toBe(1995));
        it("driver take-home (85%) = 1615", () => expect(fare.driverPayout).toBe(1615));
        it("platform take = 380", () => expect(fare.platformCommission).toBe(380));
    });

    describe("Surge protection", () => {
        it("never exceeds 1.4x", () => {
            expect(clampSurge(3.0)).toBe(MAX_SURGE_MULTIPLIER);
            expect(clampSurge(1.4)).toBe(1.4);
            expect(clampSurge(1.0)).toBe(1.0);
            expect(clampSurge(0.5)).toBe(1.0); // floor at 1
        });

        it("applies surge to the subtotal but the service fee stays 5%", () => {
            const fare = computeRideFare({
                basePrice: 6.0, pricePerKm: 2.2, pricePerMin: 0.4,
                distanceKm: 8, durationMin: 15, minimumFare: 10,
                surgeMultiplier: 3.0, // requests 3x; must be capped to 1.4x
            });
            expect(fare.surgeMultiplier).toBe(1.4);
            // surged subtotal = 29.60 * 1.4 = 41.44; fee = 5% = 2.072 -> 2.07
            expect(fare.effectiveSubtotal).toBe(41.44);
            expect(fare.serviceFee).toBe(2.07);
            // service fee is still exactly 5% of the (surged) subtotal
            expect(fare.serviceFee).toBeCloseTo(fare.effectiveSubtotal * SERVICE_FEE_RATE, 2);
        });
    });

    describe("Minimum fare floor", () => {
        it("floors a tiny trip and keeps the 15/85 identity", () => {
            const fare = computeRideFare({
                basePrice: 400, pricePerKm: 110, pricePerMin: 20,
                distanceKm: 0, durationMin: 0, minimumFare: 800,
            });
            // base 400 + fee 20 = 420 < 800 -> floored to 800
            expect(fare.finalFare).toBe(800);
            expect(fare.driverPayout + fare.platformCommission).toBeCloseTo(800, 1);
        });
    });

    describe("Cross-vertical weighting (GH base 6.00 / 2.20 / 0.40, 8km 15min)", () => {
        const args = {
            basePrice: 6.0, pricePerKm: 2.2, pricePerMin: 0.4,
            distanceKm: 8, durationMin: 15, minimumFare: 0,
        };

        it("RIDES = 1.0x base -> 29.60", () => {
            expect(computeRideFare({ ...args, vertical: PricingVertical.RIDES }).subtotal).toBe(29.6);
        });
        it("FOOD = 0.8x base + 1.2x km", () => {
            // 6*0.8 + 2.2*1.2*8 + 0.4*15 = 4.8 + 21.12 + 6 = 31.92
            expect(computeRideFare({ ...args, vertical: PricingVertical.FOOD }).subtotal).toBe(31.92);
        });
        it("PACKAGE = 1.2x base", () => {
            // 6*1.2 + 2.2*8 + 0.4*15 = 7.2 + 17.6 + 6 = 30.80
            expect(computeRideFare({ ...args, vertical: PricingVertical.PACKAGE }).subtotal).toBe(30.8);
        });
        it("MARKETPLACE = 0.7x base, distance only (no time)", () => {
            // 6*0.7 + 2.2*8 + 0 = 4.2 + 17.6 = 21.80
            expect(computeRideFare({ ...args, vertical: PricingVertical.MARKETPLACE }).subtotal).toBe(21.8);
        });
    });

    describe("Delivery fee weighting (base 50, perKm 10, 5km)", () => {
        it("FOOD: 50*0.8 + 10*1.2*5 = 100", () => {
            expect(computeDeliveryFee({ baseFee: 50, perKmFee: 10, distanceKm: 5, vertical: PricingVertical.FOOD }).deliveryFee).toBe(100);
        });
        it("PACKAGE: 50*1.2 + 10*5 = 110", () => {
            expect(computeDeliveryFee({ baseFee: 50, perKmFee: 10, distanceKm: 5, vertical: PricingVertical.PACKAGE }).deliveryFee).toBe(110);
        });
        it("MARKETPLACE: 50*0.7 + 10*5 = 85", () => {
            expect(computeDeliveryFee({ baseFee: 50, perKmFee: 10, distanceKm: 5, vertical: PricingVertical.MARKETPLACE }).deliveryFee).toBe(85);
        });
        it("splits driver/platform by share rate (75%)", () => {
            const fee = computeDeliveryFee({ baseFee: 50, perKmFee: 10, distanceKm: 5, vertical: PricingVertical.PACKAGE, driverShareRate: 0.75 });
            expect(fee.driverPayout).toBe(82.5);
            expect(fee.platformCommission).toBe(27.5);
        });
    });

    describe("Vertical resolution from merchant category", () => {
        it("food categories -> FOOD", () => {
            expect(resolveOrderVertical("Restaurant")).toBe(PricingVertical.FOOD);
            expect(resolveOrderVertical("grocery")).toBe(PricingVertical.FOOD);
        });
        it("everything else -> MARKETPLACE", () => {
            expect(resolveOrderVertical("electronics")).toBe(PricingVertical.MARKETPLACE);
            expect(resolveOrderVertical(null)).toBe(PricingVertical.MARKETPLACE);
        });
    });
});
