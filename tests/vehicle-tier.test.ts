import { computeRequiredVehicleTier, vehicleMeetsTier, CartItemDimensions } from "../src/utils/vehicle-tier";
import { VehicleType } from "../src/models/vehicle-pricing";

const item = (over: Partial<CartItemDimensions> = {}): CartItemDimensions => ({
    lengthIn: 6, widthIn: 4, heightIn: 3, weightLb: 1,
    isFragile: false, isPerishable: false, requiresOpenAir: false,
    quantity: 1,
    ...over,
});

describe("computeRequiredVehicleTier", () => {
    it("puts a small light parcel on a bike", () => {
        expect(computeRequiredVehicleTier([item()])).toBe(VehicleType.BIKE);
    });

    it("escalates to CAR on weight alone", () => {
        expect(computeRequiredVehicleTier([item({ weightLb: 40 })])).toBe(VehicleType.CAR);
    });

    it("escalates to CAR when quantity pushes total weight over the bike limit", () => {
        // 1 lb each is bike-sized, but 20 of them is not.
        expect(computeRequiredVehicleTier([item({ quantity: 20 })])).toBe(VehicleType.CAR);
    });

    it("escalates to SUV for a long item", () => {
        expect(computeRequiredVehicleTier([item({ lengthIn: 60 })])).toBe(VehicleType.SUV);
    });

    it("escalates to SUV when anything is fragile", () => {
        expect(computeRequiredVehicleTier([item({ isFragile: true })])).toBe(VehicleType.SUV);
    });

    it("escalates to SUV when an item needs open air", () => {
        expect(computeRequiredVehicleTier([item({ requiresOpenAir: true })])).toBe(VehicleType.SUV);
    });

    it("requires a TRUCK for very heavy loads", () => {
        expect(computeRequiredVehicleTier([item({ weightLb: 400 })])).toBe(VehicleType.TRUCK);
    });

    it("defaults to CAR when nothing is measured (never under-dispatches to a bike)", () => {
        expect(computeRequiredVehicleTier([
            item({ lengthIn: null, widthIn: null, heightIn: null, weightLb: null }),
        ])).toBe(VehicleType.CAR);
    });

    it("defaults to CAR for an empty cart", () => {
        expect(computeRequiredVehicleTier([])).toBe(VehicleType.CAR);
    });

    it("takes the largest requirement across mixed items", () => {
        expect(computeRequiredVehicleTier([item(), item({ weightLb: 350 })])).toBe(VehicleType.TRUCK);
    });
});

describe("vehicleMeetsTier", () => {
    it("allows an equal or larger vehicle", () => {
        expect(vehicleMeetsTier(VehicleType.SUV, VehicleType.SUV)).toBe(true);
        expect(vehicleMeetsTier(VehicleType.TRUCK, VehicleType.SUV)).toBe(true);
    });

    it("rejects a vehicle that is too small", () => {
        expect(vehicleMeetsTier(VehicleType.BIKE, VehicleType.SUV)).toBe(false);
        expect(vehicleMeetsTier(VehicleType.CAR, VehicleType.TRUCK)).toBe(false);
    });

    it("treats PRIORITY as car-sized", () => {
        expect(vehicleMeetsTier(VehicleType.PRIORITY, VehicleType.CAR)).toBe(true);
        expect(vehicleMeetsTier(VehicleType.PRIORITY, VehicleType.SUV)).toBe(false);
    });

    it("imposes no requirement when the order has no tier (legacy orders)", () => {
        expect(vehicleMeetsTier(VehicleType.BIKE, null)).toBe(true);
    });
});
