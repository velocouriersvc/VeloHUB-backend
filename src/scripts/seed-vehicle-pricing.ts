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
    riderServiceFee: number;
    maxPassengers: number;
}

// ── US: client-specified rates (UPDATED April 22, 2026 - CLIENT REQUEST) ───────────────
// Pricing stored as per-km (backend uses km internally)
// Based on US Itemized Rate Card from client
// Service fees vary by vehicle per client spec
const US_PRICING: PricingRow[] = [
    { vehicleType: VehicleType.BIKE, country: "US", basePrice: 2.00, pricePerKm: 0.60, pricePerMin: 0.15, minimumFare: 7.00, riderServiceFee: 1.50, maxPassengers: 1 },
    { vehicleType: VehicleType.CAR,  country: "US", basePrice: 3.50, pricePerKm: 1.40, pricePerMin: 0.35, minimumFare: 10.00, riderServiceFee: 3.00, maxPassengers: 4 },
    { vehicleType: VehicleType.SUV,  country: "US", basePrice: 7.00, pricePerKm: 2.50, pricePerMin: 0.65, minimumFare: 20.00, riderServiceFee: 6.00, maxPassengers: 6 },
    { vehicleType: VehicleType.TRUCK,country: "US", basePrice: 15.00, pricePerKm: 4.50, pricePerMin: 1.20, minimumFare: 40.00, riderServiceFee: 10.00, maxPassengers: 2 },
];

// ── Nigeria: client-specified exact rates (UPDATED April 22, 2026) ────
// Rider Service Fee: ₦400 (per client spec)
const NG_PRICING: PricingRow[] = [
    { vehicleType: VehicleType.BIKE, country: "NG", basePrice: 1200, pricePerKm: 650,  pricePerMin: 220, minimumFare: 5000,  riderServiceFee: 400, maxPassengers: 1 },
    { vehicleType: VehicleType.CAR,  country: "NG", basePrice: 2600, pricePerKm: 850,  pricePerMin: 270, minimumFare: 6000,  riderServiceFee: 400, maxPassengers: 4 },
    { vehicleType: VehicleType.SUV,  country: "NG", basePrice: 4200, pricePerKm: 1280, pricePerMin: 410, minimumFare: 11000, riderServiceFee: 400, maxPassengers: 6 },
    { vehicleType: VehicleType.TRUCK,country: "NG", basePrice: 6800, pricePerKm: 1750, pricePerMin: 560, minimumFare: 11500, riderServiceFee: 400, maxPassengers: 2 },
];

// ── Ghana: ACTUAL production rates (CLIENT REQUEST April 22, 2026) ──
// NEW PRICING: Dramatically reduced rates (70-80% lower than previous)
// Service fees match base fare per client spec
const GH_PRICING: PricingRow[] = [
    { vehicleType: VehicleType.BIKE, country: "GH", basePrice: 3.00,  pricePerKm: 1.00, pricePerMin: 0.40, minimumFare: 10.00, riderServiceFee: 3.00, maxPassengers: 1 },
    { vehicleType: VehicleType.CAR,  country: "GH", basePrice: 5.00,  pricePerKm: 2.00, pricePerMin: 0.80, minimumFare: 10.00, riderServiceFee: 5.00, maxPassengers: 4 },
    { vehicleType: VehicleType.SUV,  country: "GH", basePrice: 8.00,  pricePerKm: 3.50, pricePerMin: 1.20, minimumFare: 10.00, riderServiceFee: 8.00, maxPassengers: 6 },
    { vehicleType: VehicleType.TRUCK, country: "GH", basePrice: 15.00, pricePerKm: 5.00, pricePerMin: 2.50, minimumFare: 10.00, riderServiceFee: 15.00, maxPassengers: 2 },
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

    // Auto-migration: Add riderServiceFee column if it doesn't exist
    // This is safe to run multiple times - it checks before altering
    try {
        const queryRunner = AppDataSource.createQueryRunner();
        await queryRunner.connect();
        
        // Check if column exists using precise query
        const result = await queryRunner.query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_schema = 'public'
              AND table_name = 'vehicle_pricing' 
              AND column_name = 'riderServiceFee'
        `);
        
        // Only add column if it truly doesn't exist
        if (!result || result.length === 0) {
            console.log("🔧 Adding riderServiceFee column to vehicle_pricing table...");
            await queryRunner.query(`
                ALTER TABLE vehicle_pricing 
                ADD COLUMN "riderServiceFee" DECIMAL(8,2) NOT NULL DEFAULT 1.99
            `);
            console.log("✅ riderServiceFee column added successfully");
        } else {
            console.log("✓ riderServiceFee column already exists, skipping migration");
        }
        
        await queryRunner.release();
    } catch (err) {
        // If any error occurs (column exists, permission issue, etc.), continue safely
        const errorMsg = (err as Error).message;
        if (errorMsg.includes('already exists')) {
            console.log("✓ riderServiceFee column already exists, skipping migration");
        } else {
            console.warn("⚠️  Migration check failed (continuing anyway):", errorMsg);
        }
    }

    const repo = AppDataSource.getRepository(VehiclePricing);

    let upserted = 0;
    let updated = 0;
    let created = 0;
    
    for (const data of ALL_PRICING) {
        // Find existing row by unique combination of vehicleType + country
        const existing = await repo.findOne({
            where: { vehicleType: data.vehicleType, country: data.country },
        });

        if (existing) {
            // UPDATE existing row - safe, no duplicates
            Object.assign(existing, data);
            existing.isActive = true;
            await repo.save(existing);
            updated++;
        } else {
            // CREATE new row - only if doesn't exist
            await repo.save(repo.create({ ...data, isActive: true }));
            created++;
        }
        upserted++;
    }

    console.log(`✅ vehicle_pricing: upserted ${upserted} rows (${created} created, ${updated} updated)`);

    if (!alreadyInitialised) {
        await AppDataSource.destroy();
    }
}

if (require.main === module) {
    seedVehiclePricing(false)
        .then(() => console.log("Done — vehicle_pricing seeded."))
        .catch(console.error);
}
