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

// ── US: client-specified rates (CAR is the reference) ───────────────
// Client example: Base $2.00 + $1.00/mile + $0.20/min
// We convert per-mile to per-km for internal calculations.
const US_PER_KM = +(1.00 / MI_TO_KM).toFixed(4);

const US_PRICING: PricingRow[] = [
    { vehicleType: VehicleType.BIKE, country: "US", basePrice: 1.50, pricePerKm: +(0.75 / MI_TO_KM).toFixed(4) as any, pricePerMin: 0.15, minimumFare: 3.50, maxPassengers: 1 },
    { vehicleType: VehicleType.CAR,  country: "US", basePrice: 2.00, pricePerKm: US_PER_KM,  pricePerMin: 0.20, minimumFare: 5.00, maxPassengers: 4 },
    { vehicleType: VehicleType.SUV,  country: "US", basePrice: 3.00, pricePerKm: +(1.50 / MI_TO_KM).toFixed(4) as any, pricePerMin: 0.30, minimumFare: 8.00, maxPassengers: 6 },
    { vehicleType: VehicleType.TRUCK,country: "US", basePrice: 5.00, pricePerKm: +(2.00 / MI_TO_KM).toFixed(4) as any, pricePerMin: 0.40, minimumFare: 12.00, maxPassengers: 2 },
];

// ── Nigeria: client-specified exact rates ────────────────────────────
// Base ₦600, Per Km ₦120, Per Min ₦25, Min Fare ₦1,200
const NG_PRICING: PricingRow[] = [
    { vehicleType: VehicleType.BIKE, country: "NG", basePrice: 400,  pricePerKm: 80,   pricePerMin: 15, minimumFare: 800,  maxPassengers: 1 },
    { vehicleType: VehicleType.CAR,  country: "NG", basePrice: 600,  pricePerKm: 120,  pricePerMin: 25, minimumFare: 1200, maxPassengers: 4 },
    { vehicleType: VehicleType.SUV,  country: "NG", basePrice: 900,  pricePerKm: 180,  pricePerMin: 35, minimumFare: 1800, maxPassengers: 6 },
    { vehicleType: VehicleType.TRUCK,country: "NG", basePrice: 1500, pricePerKm: 250,  pricePerMin: 50, minimumFare: 3000, maxPassengers: 2 },
];

// ── Ghana: proportional (~16× USD) ──────────────────────────────────
function ghPricing(): PricingRow[] {
    const m = 16;
    return US_PRICING.map(r => ({
        ...r,
        country: "GH",
        basePrice: +(r.basePrice * m).toFixed(2),
        pricePerKm: +(Number(r.pricePerKm) * m).toFixed(2),
        pricePerMin: +(r.pricePerMin * m).toFixed(2),
        minimumFare: +(r.minimumFare * m).toFixed(2),
    }));
}

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
    ...ghPricing(),
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
