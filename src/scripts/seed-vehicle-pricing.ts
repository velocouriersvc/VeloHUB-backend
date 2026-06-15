import "dotenv/config";
import { AppDataSource } from "../db/data-source";
import { VehiclePricing, VehicleType } from "../models/vehicle-pricing";

/**
 * Vehicle pricing per country - client-specified rates.
 *
 * US (base market):
 *   Base Fare $2.00, Per Mile $1.00 (→ per-km ÷1.609), Per Minute $0.20
 *   Minimum Fare: ~$5.00
 *   Rider Service Fee: $1.99 (stored in platform_settings, not here)
 *
 * Nigeria:
 *   Base Fare ₦600, Per Km ₦120, Per Min ₦25
 *   Minimum Fare: ₦1,200
 *   Rider Service Fee: ₦400 (stored in platform_settings)
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

// ── US: CLIENT PRICING April 23 2026 ───────────────────────────────
// Per-mile rates converted to per-km (÷ 1.60934)
// All US vehicles share $3.00 service fee per client spec
//   Velo Go      $30 est  | bike  | base 1.00 | $1.30/mi → $0.81/km | $0.13/min | min $10
//   Velo Standard $44 est | car   | base 2.50 | $1.90/mi → $1.18/km | $0.21/min | min $10
//   Velo Comfort  $85 est | suv   | base 6.00 | $3.80/mi → $2.36/km | $0.38/min | min $15
//   Velo XL       $85 est | suv   | (same as Comfort - frontend shows as separate tier)
//   Velo Truck   $142 est | truck | base 15.00| $6.20/mi → $3.85/km | $0.72/min | min $25
const US_PRICING: PricingRow[] = [
    { vehicleType: VehicleType.BIKE,  country: "US", basePrice: 1.00,  pricePerKm: 0.81, pricePerMin: 0.13, minimumFare: 10.00, riderServiceFee: 3.00, maxPassengers: 1 },
    { vehicleType: VehicleType.CAR,   country: "US", basePrice: 2.50,  pricePerKm: 1.18, pricePerMin: 0.21, minimumFare: 10.00, riderServiceFee: 3.00, maxPassengers: 4 },
    { vehicleType: VehicleType.SUV,   country: "US", basePrice: 6.00,  pricePerKm: 2.36, pricePerMin: 0.38, minimumFare: 15.00, riderServiceFee: 3.00, maxPassengers: 6 },
    { vehicleType: VehicleType.TRUCK, country: "US", basePrice: 15.00, pricePerKm: 3.85, pricePerMin: 0.72, minimumFare: 25.00, riderServiceFee: 3.00, maxPassengers: 2 },
];

// ── Nigeria: competitive rates (UPDATED April 30, 2026) ──────────────
// Calibrated to match Bolt/Uber pricing for Lagos routes.
// Target: ~₦5,100 bike | ~₦7,800 car | ~₦11,400 SUV for a 20km/40min trip.
// Rider Service Fee: ₦400 (per client spec)
const NG_PRICING: PricingRow[] = [
    { vehicleType: VehicleType.BIKE, country: "NG", basePrice: 500,  pricePerKm: 130, pricePerMin: 40,  minimumFare: 4500,  riderServiceFee: 400, maxPassengers: 1 },
    { vehicleType: VehicleType.CAR,  country: "NG", basePrice: 800,  pricePerKm: 200, pricePerMin: 65,  minimumFare: 6000,  riderServiceFee: 400, maxPassengers: 4 },
    { vehicleType: VehicleType.SUV,  country: "NG", basePrice: 1200, pricePerKm: 300, pricePerMin: 95,  minimumFare: 9000,  riderServiceFee: 400, maxPassengers: 6 },
    { vehicleType: VehicleType.TRUCK,country: "NG", basePrice: 2000, pricePerKm: 450, pricePerMin: 140, minimumFare: 12000, riderServiceFee: 400, maxPassengers: 2 },
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

// ── Kenya (KES): competitive Nairobi rates (Bolt/Uber benchmarked) ──
// Target ~KES 630 for a 10km/20min car trip. ⚠️ Validate against live market before launch.
const KE_PRICING: PricingRow[] = [
    { vehicleType: VehicleType.BIKE,  country: "KE", basePrice: 50,  pricePerKm: 25,  pricePerMin: 3,   minimumFare: 150,  riderServiceFee: 30,  maxPassengers: 1 },
    { vehicleType: VehicleType.CAR,   country: "KE", basePrice: 100, pricePerKm: 45,  pricePerMin: 4,   minimumFare: 300,  riderServiceFee: 50,  maxPassengers: 4 },
    { vehicleType: VehicleType.SUV,   country: "KE", basePrice: 200, pricePerKm: 70,  pricePerMin: 6,   minimumFare: 500,  riderServiceFee: 80,  maxPassengers: 6 },
    { vehicleType: VehicleType.TRUCK, country: "KE", basePrice: 400, pricePerKm: 120, pricePerMin: 10,  minimumFare: 800,  riderServiceFee: 150, maxPassengers: 2 },
];

// ── South Africa (ZAR): competitive Joburg/CT rates ─────────────────
// Target ~R119 for a 10km/20min car trip. ⚠️ Validate before launch.
const ZA_PRICING: PricingRow[] = [
    { vehicleType: VehicleType.BIKE,  country: "ZA", basePrice: 10, pricePerKm: 5,  pricePerMin: 0.80, minimumFare: 30,  riderServiceFee: 6,  maxPassengers: 1 },
    { vehicleType: VehicleType.CAR,   country: "ZA", basePrice: 15, pricePerKm: 8,  pricePerMin: 1.20, minimumFare: 45,  riderServiceFee: 8,  maxPassengers: 4 },
    { vehicleType: VehicleType.SUV,   country: "ZA", basePrice: 25, pricePerKm: 13, pricePerMin: 1.80, minimumFare: 70,  riderServiceFee: 12, maxPassengers: 6 },
    { vehicleType: VehicleType.TRUCK, country: "ZA", basePrice: 50, pricePerKm: 22, pricePerMin: 3.00, minimumFare: 120, riderServiceFee: 25, maxPassengers: 2 },
];

// ── Tanzania (TZS): competitive Dar es Salaam rates ─────────────────
// Target ~TZS 9,100 for a 10km/20min car trip. ⚠️ Validate before launch.
const TZ_PRICING: PricingRow[] = [
    { vehicleType: VehicleType.BIKE,  country: "TZ", basePrice: 1000, pricePerKm: 350,  pricePerMin: 50,  minimumFare: 2500,  riderServiceFee: 500,  maxPassengers: 1 },
    { vehicleType: VehicleType.CAR,   country: "TZ", basePrice: 1500, pricePerKm: 600,  pricePerMin: 80,  minimumFare: 4000,  riderServiceFee: 700,  maxPassengers: 4 },
    { vehicleType: VehicleType.SUV,   country: "TZ", basePrice: 3000, pricePerKm: 1000, pricePerMin: 130, minimumFare: 7000,  riderServiceFee: 1200, maxPassengers: 6 },
    { vehicleType: VehicleType.TRUCK, country: "TZ", basePrice: 6000, pricePerKm: 1800, pricePerMin: 250, minimumFare: 12000, riderServiceFee: 2000, maxPassengers: 2 },
];

// ── Uganda (UGX): competitive Kampala rates ─────────────────────────
// Target ~UGX 15,100 for a 10km/20min car trip. ⚠️ Validate before launch.
const UG_PRICING: PricingRow[] = [
    { vehicleType: VehicleType.BIKE,  country: "UG", basePrice: 1500,  pricePerKm: 600,  pricePerMin: 80,  minimumFare: 3000,  riderServiceFee: 700,  maxPassengers: 1 },
    { vehicleType: VehicleType.CAR,   country: "UG", basePrice: 2500,  pricePerKm: 1000, pricePerMin: 130, minimumFare: 6000,  riderServiceFee: 1200, maxPassengers: 4 },
    { vehicleType: VehicleType.SUV,   country: "UG", basePrice: 5000,  pricePerKm: 1700, pricePerMin: 220, minimumFare: 10000, riderServiceFee: 2000, maxPassengers: 6 },
    { vehicleType: VehicleType.TRUCK, country: "UG", basePrice: 10000, pricePerKm: 3000, pricePerMin: 400, minimumFare: 18000, riderServiceFee: 3500, maxPassengers: 2 },
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
    ...KE_PRICING,
    ...ZA_PRICING,
    ...TZ_PRICING,
    ...UG_PRICING,
    ...caPricing(),
    ...inPricing(),
];

/**
 * Seed vehicle_pricing rows.
 * UPSERTS - existing rows are UPDATED to match the latest config.
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

    // Velo operates in Africa only - deactivate any non-African vehicle pricing (US/CA/IN/etc.).
    const AFRICAN_COUNTRIES = ["GH", "NG", "KE", "ZA", "TZ", "UG"];
    const deactivated = await repo
        .createQueryBuilder()
        .update()
        .set({ isActive: false })
        .where("country NOT IN (:...countries)", { countries: AFRICAN_COUNTRIES })
        .andWhere("isActive = true")
        .execute();
    if (deactivated.affected) {
        console.log(`✅ vehicle_pricing: deactivated ${deactivated.affected} non-African row(s)`);
    }

    if (!alreadyInitialised) {
        await AppDataSource.destroy();
    }
}

if (require.main === module) {
    seedVehiclePricing(false)
        .then(() => console.log("Done - vehicle_pricing seeded."))
        .catch(console.error);
}
