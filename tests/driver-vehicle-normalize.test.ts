import { normalizeVehicleType } from "../src/services/driver-match-service";
import { VehicleType } from "../src/models/vehicle-pricing";

/**
 * Guards the ride "No drivers" + "does not work when you click" bug: drivers onboard with a
 * free-text vehicle type ("Car", "Motorcycle", "Van", ...) while matching compares against the
 * enum (bike/car/priority/suv/truck). Without normalization, "Car" !== "car", so every online
 * driver was filtered out of every tier. These assert the onboarding vocabulary resolves correctly.
 */
describe("normalizeVehicleType", () => {
    it("maps the onboarding vocabulary to the backend enum", () => {
        expect(normalizeVehicleType("Car")).toBe(VehicleType.CAR);
        expect(normalizeVehicleType("Motorcycle")).toBe(VehicleType.BIKE);
        expect(normalizeVehicleType("Bicycle")).toBe(VehicleType.BIKE);
        expect(normalizeVehicleType("Tricycle")).toBe(VehicleType.BIKE);
        expect(normalizeVehicleType("Van")).toBe(VehicleType.SUV);
        expect(normalizeVehicleType("Truck")).toBe(VehicleType.TRUCK);
    });

    it("handles common synonyms and casing", () => {
        expect(normalizeVehicleType("sedan")).toBe(VehicleType.CAR);
        expect(normalizeVehicleType("TAXI")).toBe(VehicleType.CAR);
        expect(normalizeVehicleType("Okada")).toBe(VehicleType.BIKE);
        expect(normalizeVehicleType("SUV")).toBe(VehicleType.SUV);
        expect(normalizeVehicleType("Pickup")).toBe(VehicleType.TRUCK);
    });

    it("passes through enum values and defaults unknown to car", () => {
        expect(normalizeVehicleType("car")).toBe(VehicleType.CAR);
        expect(normalizeVehicleType("truck")).toBe(VehicleType.TRUCK);
        expect(normalizeVehicleType("")).toBe(VehicleType.CAR);
        expect(normalizeVehicleType(null)).toBe(VehicleType.CAR);
        expect(normalizeVehicleType("something weird")).toBe(VehicleType.CAR);
    });

    it("resolves the exact production failure: a 'Car' driver serves Velo Standard and Velo Priority", () => {
        const COMPAT: Record<string, VehicleType[]> = {
            [VehicleType.CAR]: [VehicleType.CAR, VehicleType.PRIORITY],
            [VehicleType.PRIORITY]: [VehicleType.PRIORITY, VehicleType.CAR],
            [VehicleType.BIKE]: [VehicleType.BIKE],
            [VehicleType.SUV]: [VehicleType.SUV],
            [VehicleType.TRUCK]: [VehicleType.TRUCK],
        };
        const driver = normalizeVehicleType("Car");
        expect(COMPAT[VehicleType.CAR].includes(driver)).toBe(true);      // Velo Standard
        expect(COMPAT[VehicleType.PRIORITY].includes(driver)).toBe(true); // Velo Priority
        expect(COMPAT[VehicleType.BIKE].includes(driver)).toBe(false);    // Velo Go
        expect(COMPAT[VehicleType.SUV].includes(driver)).toBe(false);     // Velo Premium
        expect(COMPAT[VehicleType.TRUCK].includes(driver)).toBe(false);   // Velo Truck
    });
});
