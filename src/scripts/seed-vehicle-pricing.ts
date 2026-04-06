import "dotenv/config";
import { AppDataSource } from "../db/data-source";
import { VehiclePricing, VehicleType } from "../models/vehicle-pricing";

/*
 * Vehicle pricing for every country in platform_settings.
 *
 * Pricing is currency-proportional so the *real-world cost* feels
 * consistent across markets:
 *   GH (GHS)  – base market
 *   NG (NGN)  – ~100× GHS  (₦500 ≈ ₵5)
 *   US (USD)  – ~0.6× GHS  ($3 ≈ ₵5)
 *   CA (CAD)  – ~0.8× GHS  (C$4 ≈ ₵5)
 *   IN (INR)  – ~6× GHS    (₹30 ≈ ₵5)
 *
 * Can be run standalone:  npx ts-node src/scripts/seed-vehicle-pricing.ts
 * Also called automatically on first server boot via runSeeds().
 */

interface PricingRow {
    vehicleType: VehicleType;
    country: string;
    basePrice: number;
    pricePerKm: number;
    pricePerMin: number;
    minimumFare: number;
    maxPassengers: number;
}

// Helper — generate all 4 vehicle types for a country using a multiplier
function countryPricing(country: string, m: number): PricingRow[] {
    return [
        { vehicleType: VehicleType.BIKE, country, basePrice: +(5 * m).toFixed(2), pricePerKm: +(2.5 * m).toFixed(2), pricePerMin: +(0.3 * m).toFixed(2), minimumFare: +(8 * m).toFixed(2), maxPassengers: 1 },
        { vehicleType: VehicleType.CAR, country, basePrice: +(8 * m).toFixed(2), pricePerKm: +(3.5 * m).toFixed(2), pricePerMin: +(0.5 * m).toFixed(2), minimumFare: +(15 * m).toFixed(2), maxPassengers: 4 },
        { vehicleType: VehicleType.SUV, country, basePrice: +(12 * m).toFixed(2), pricePerKm: +(5 * m).toFixed(2), pricePerMin: +(0.7 * m).toFixed(2), minimumFare: +(25 * m).toFixed(2), maxPassengers: 6 },
        { vehicleType: VehicleType.TRUCK, country, basePrice: +(20 * m).toFixed(2), pricePerKm: +(7 * m).toFixed(2), pricePerMin: +(1 * m).toFixed(2), minimumFare: +(40 * m).toFixed(2), maxPassengers: 2 },
    ];
}

// All countries matching platform_settings, with currency multiplier
const PRICING_DATA: PricingRow[] = [
    // GH — GHS (base market, multiplier 1×)
    ...countryPricing("GH", 1),
    // NG — NGN (~100× GHS)
    ...countryPricing("NG", 100),
    // US — USD (~0.6× GHS)
    ...countryPricing("US", 0.6),
    // CA — CAD (~0.8× GHS)
    ...countryPricing("CA", 0.8),
    // IN — INR (~6× GHS)
    ...countryPricing("IN", 6),
];

/**
 * Seed vehicle_pricing rows. Safe to call multiple times — existing
 * rows are skipped thanks to the (vehicleType, country) unique check.
 *
 * @param alreadyInitialised  pass `true` when called from index.ts
 *                            (AppDataSource is already connected).
 */
export async function seedVehiclePricing(alreadyInitialised = false) {
    if (!alreadyInitialised) {
        await AppDataSource.initialize();
    }

    const repo = AppDataSource.getRepository(VehiclePricing);

    let created = 0;
    for (const data of PRICING_DATA) {
        const exists = await repo.findOne({
            where: { vehicleType: data.vehicleType, country: data.country },
        });

        if (exists) {
            continue; // already seeded — skip silently
        }

        await repo.save(repo.create({ ...data, isActive: true }));
        created++;
    }

    if (created > 0) {
        console.log(`✅ vehicle_pricing: seeded ${created} new rows`);
    }

    if (!alreadyInitialised) {
        await AppDataSource.destroy();
    }
}

// Allow standalone execution
if (require.main === module) {
    seedVehiclePricing(false)
        .then(() => console.log("Done — vehicle_pricing seeded."))
        .catch(console.error);
}
