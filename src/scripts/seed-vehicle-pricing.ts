import "dotenv/config";
import { AppDataSource } from "../db/data-source";
import { VehiclePricing, VehicleType } from "../models/vehicle-pricing";

/**
 * Vehicle pricing per country — client-specified rates.
 *
 * US (base market):
 *   Base Fare $2.00, Per Mile $1.00 (→ per-km ÷1.609), Per Minute $0.20
 *   Minimum Fare: ~$5.00
 *   Rider Service Fee: $1.99 (stored in platform_settings, not here)
 *
 * Nigeria:
 *   Base Fare ₦600, Per Km ₦120, Per Min ₦25
 *   Minimum Fare: ₦1,200
 *   Rider Service Fee: ₦300 (stored in platform_settings)
 *
 * Ghana / Canada / India: proportional to US base.
 */

const MI_TO_KM = 1.60934;

interface PricingRow {
    vehicleType: VehicleType;
    country: string;
    basePrice: number;
    pricePerKm: number;
    pricePerMin: number;
    minimumFare: number;
    maxPassengers: number;
}

// ── US: client-specified rates (UPDATED April 22, 2026) ───────────────
// Pricing stored as per-km (backend uses km internally)
// Rider Service Fee: $1.99 (stored in platform_settings)
const US_PRICING: PricingRow[] = [
    { vehicleType: VehicleType.BIKE, country: "US", basePrice: 2.00, pricePerKm: 0.75, pricePerMin: 0.22, minimumFare: 5.50, maxPassengers: 1 },
    { vehicleType: VehicleType.CAR,  country: "US", basePrice: 2.50, pricePerKm: 0.85, pricePerMin: 0.28, minimumFare: 7.50, maxPassengers: 4 },
    { vehicleType: VehicleType.SUV,  country: "US", basePrice: 4.00, pricePerKm: 1.25, pricePerMin: 0.40, minimumFare: 11.00, maxPassengers: 6 },
    { vehicleType: VehicleType.TRUCK,country: "US", basePrice: 8.00, pricePerKm: 1.80, pricePerMin: 0.65, minimumFare: 15.00, maxPassengers: 2 },
];

// ── Nigeria: client-specified exact rates (UPDATED April 22, 2026) ────
// Rider Service Fee: ₦400 (stored in platform_settings)
const NG_PRICING: PricingRow[] = [
    { vehicleType: VehicleType.BIKE, country: "NG", basePrice: 1200, pricePerKm: 650,  pricePerMin: 220, minimumFare: 5000,  maxPassengers: 1 },
    { vehicleType: VehicleType.CAR,  country: "NG", basePrice: 2600, pricePerKm: 850,  pricePerMin: 270, minimumFare: 6000,  maxPassengers: 4 },
    { vehicleType: VehicleType.SUV,  country: "NG", basePrice: 4200, pricePerKm: 1280, pricePerMin: 410, minimumFare: 11000, maxPassengers: 6 },
    { vehicleType: VehicleType.TRUCK,country: "NG", basePrice: 6800, pricePerKm: 1750, pricePerMin: 560, minimumFare: 11500, maxPassengers: 2 },
];

// ── Ghana: ACTUAL production rates (client-specified April 22, 2026) ──
// Rider Service Fee: GH₵ 4.00 (stored in platform_settings)
const GH_PRICING: PricingRow[] = [
    { vehicleType: VehicleType.BIKE, country: "GH", basePrice: 12.00, pricePerKm: 6.80,  pricePerMin: 2.20, minimumFare: 50.00,  maxPassengers: 1 },
    { vehicleType: VehicleType.CAR,  country: "GH", basePrice: 26.00, pricePerKm: 8.50,  pricePerMin: 2.70, minimumFare: 60.00,  maxPassengers: 4 },
    { vehicleType: VehicleType.SUV,  country: "GH", basePrice: 42.00, pricePerKm: 12.80, pricePerMin: 4.10, minimumFare: 110.00, maxPassengers: 6 },
    { vehicleType: VehicleType.TRUCK, country: "GH", basePrice: 68.00, pricePerKm: 17.50, pricePerMin: 5.60, minimumFare: 115.00, maxPassengers: 2 },
];

// ── Canada: ~1.35× USD ──────────────────────────────────────────────
function caPricing(): PricingRow[] {
    const m = 1.35;
    return US_PRICING.map(r => ({
        ...r,
        country: "CA",
        basePrice: +(r.basePrice * m).toFixed(2),
        pricePerKm: +(Number(r.pricePerKm) * m).toFixed(4),
        pricePerMin: +(r.pricePerMin * m).toFixed(2),
        minimumFare: +(r.minimumFare * m).toFixed(2),
    }));
}

// ── India: ~83× USD ─────────────────────────────────────────────────
function inPricing(): PricingRow[] {
    const m = 83;
    return US_PRICING.map(r => ({
        ...r,
        country: "IN",
        basePrice: +(r.basePrice * m).toFixed(2),
        pricePerKm: +(Number(r.pricePerKm) * m).toFixed(2),
        pricePerMin: +(r.pricePerMin * m).toFixed(2),
        minimumFare: +(r.minimumFare * m).toFixed(2),
    }));
}

const ALL_PRICING: PricingRow[] = [
    ...US_PRICING,
    ...NG_PRICING,
    ...GH_PRICING,
    ...caPricing(),
    ...inPricing(),
];

/**
 * Seed vehicle_pricing rows.
 * UPSERTS — existing rows are UPDATED to match the latest config.
 */
export async function seedVehiclePricing(alreadyInitialised = false) {
    if (!alreadyInitialised) {
        await AppDataSource.initialize();
    }

    const repo = AppDataSource.getRepository(VehiclePricing);

    let upserted = 0;
    for (const data of ALL_PRICING) {
        const existing = await repo.findOne({
            where: { vehicleType: data.vehicleType, country: data.country },
        });

        if (existing) {
            Object.assign(existing, data);
            existing.isActive = true;
            await repo.save(existing);
        } else {
            await repo.save(repo.create({ ...data, isActive: true }));
        }
        upserted++;
    }

    console.log(`✅ vehicle_pricing: upserted ${upserted} rows`);

    if (!alreadyInitialised) {
        await AppDataSource.destroy();
    }
}

if (require.main === module) {
    seedVehiclePricing(false)
        .then(() => console.log("Done — vehicle_pricing seeded."))
        .catch(console.error);
}
