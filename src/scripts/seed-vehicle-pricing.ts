import "dotenv/config";
import { AppDataSource } from "../db/data-source";
import { VehiclePricing, VehicleType } from "../models/vehicle-pricing";
import { Zone } from "../models/zone";

/**
 * Vehicle pricing per country - client-specified rates (July 2026 price book).
 *
 * VERSIONED SEEDING: the full upsert (which overwrites rows) only runs when
 * PRICING_SEED_VERSION increases, so admin edits made in the dashboard SURVIVE
 * pod restarts. On ordinary boots the seed only inserts missing rows.
 * Bump PRICING_SEED_VERSION whenever the price book below changes.
 */
export const PRICING_SEED_VERSION = 2;

const MI_TO_KM = 1.60934;
const perMile = (v: number) => +(v / MI_TO_KM).toFixed(4);

interface PricingRow {
    vehicleType: VehicleType;
    country: string;
    basePrice: number;
    pricePerKm: number;
    pricePerMin: number;
    minimumFare: number;
    bookingFee?: number;
    bookingFeePercent?: number;
    roadLevy?: number;
    riderServiceFee: number;
    maxPassengers: number;
}

// ── Ghana (GHS) - exact client spec, July 2026 ──────────────────────
// bikes 10 + 1.50/km + 0.30/min + fee 2 | basic 15 + 2.20 + 0.45 + 3
// premium(suv) 20 + 3.00 + 0.60 + 4.50 | trucks 40 + 4.50 + 0.80 + 7
// minimumFare = base fare so small fees are never swallowed by the floor.
const GH_PRICING: PricingRow[] = [
    { vehicleType: VehicleType.BIKE,  country: "GH", basePrice: 10.00, pricePerKm: 1.50, pricePerMin: 0.30, minimumFare: 10.00, bookingFee: 2.00, riderServiceFee: 0, maxPassengers: 1 },
    { vehicleType: VehicleType.CAR,   country: "GH", basePrice: 15.00, pricePerKm: 2.20, pricePerMin: 0.45, minimumFare: 15.00, bookingFee: 3.00, riderServiceFee: 0, maxPassengers: 4 },
    { vehicleType: VehicleType.SUV,   country: "GH", basePrice: 20.00, pricePerKm: 3.00, pricePerMin: 0.60, minimumFare: 20.00, bookingFee: 4.50, riderServiceFee: 0, maxPassengers: 6 },
    { vehicleType: VehicleType.TRUCK, country: "GH", basePrice: 40.00, pricePerKm: 4.50, pricePerMin: 0.80, minimumFare: 40.00, bookingFee: 7.00, riderServiceFee: 0, maxPassengers: 2 },
];

// ── USA (USD) - exact client spec, PER-MILE rates stored per-km ─────
const US_PRICING: PricingRow[] = [
    { vehicleType: VehicleType.BIKE,  country: "US", basePrice: 2.00,  pricePerKm: perMile(0.65), pricePerMin: 0.20, minimumFare: 2.00,  bookingFee: 2.50, riderServiceFee: 0, maxPassengers: 1 },
    { vehicleType: VehicleType.CAR,   country: "US", basePrice: 3.00,  pricePerKm: perMile(1.35), pricePerMin: 0.35, minimumFare: 3.00,  bookingFee: 4.00, riderServiceFee: 0, maxPassengers: 4 },
    { vehicleType: VehicleType.SUV,   country: "US", basePrice: 5.50,  pricePerKm: perMile(2.45), pricePerMin: 0.55, minimumFare: 5.50,  bookingFee: 5.50, riderServiceFee: 0, maxPassengers: 6 },
    { vehicleType: VehicleType.TRUCK, country: "US", basePrice: 12.00, pricePerKm: perMile(3.75), pricePerMin: 0.70, minimumFare: 12.00, bookingFee: 8.00, riderServiceFee: 0, maxPassengers: 2 },
];

// ── Canada (CAD) - exact client spec (already per-km) ───────────────
const CA_PRICING: PricingRow[] = [
    { vehicleType: VehicleType.BIKE,  country: "CA", basePrice: 2.50,  pricePerKm: 0.45, pricePerMin: 0.25, minimumFare: 2.50,  bookingFee: 3.00, riderServiceFee: 0, maxPassengers: 1 },
    { vehicleType: VehicleType.CAR,   country: "CA", basePrice: 3.75,  pricePerKm: 0.95, pricePerMin: 0.40, minimumFare: 3.75,  bookingFee: 4.50, riderServiceFee: 0, maxPassengers: 4 },
    { vehicleType: VehicleType.SUV,   country: "CA", basePrice: 7.00,  pricePerKm: 1.75, pricePerMin: 0.65, minimumFare: 7.00,  bookingFee: 6.50, riderServiceFee: 0, maxPassengers: 6 },
    { vehicleType: VehicleType.TRUCK, country: "CA", basePrice: 15.00, pricePerKm: 2.65, pricePerMin: 0.85, minimumFare: 15.00, bookingFee: 9.50, riderServiceFee: 0, maxPassengers: 2 },
];

// ── Nigeria (NGN) - exact client spec ───────────────────────────────
// 5% platform booking fee (of base+distance+time) + flat 20 Lagos road levy per ride.
// Geofence surcharges (airport, bridge) are seeded as zones below.
const NG_PRICING: PricingRow[] = [
    { vehicleType: VehicleType.BIKE,  country: "NG", basePrice: 350.00,  pricePerKm: 85.00,  pricePerMin: 15.00, minimumFare: 350.00,  bookingFee: 0, bookingFeePercent: 5, roadLevy: 20.00, riderServiceFee: 0, maxPassengers: 1 },
    { vehicleType: VehicleType.CAR,   country: "NG", basePrice: 527.00,  pricePerKm: 130.00, pricePerMin: 23.30, minimumFare: 527.00,  bookingFee: 0, bookingFeePercent: 5, roadLevy: 20.00, riderServiceFee: 0, maxPassengers: 4 },
    { vehicleType: VehicleType.SUV,   country: "NG", basePrice: 800.00,  pricePerKm: 220.00, pricePerMin: 40.00, minimumFare: 800.00,  bookingFee: 0, bookingFeePercent: 5, roadLevy: 20.00, riderServiceFee: 0, maxPassengers: 6 },
    { vehicleType: VehicleType.TRUCK, country: "NG", basePrice: 2500.00, pricePerKm: 450.00, pricePerMin: 65.00, minimumFare: 2500.00, bookingFee: 0, bookingFeePercent: 5, roadLevy: 20.00, riderServiceFee: 0, maxPassengers: 2 },
];

// ── Kenya (KES): competitive Nairobi rates ──────────────────────────
const KE_PRICING: PricingRow[] = [
    { vehicleType: VehicleType.BIKE,  country: "KE", basePrice: 50,  pricePerKm: 25,  pricePerMin: 3,   minimumFare: 150,  riderServiceFee: 30,  maxPassengers: 1 },
    { vehicleType: VehicleType.CAR,   country: "KE", basePrice: 100, pricePerKm: 45,  pricePerMin: 4,   minimumFare: 300,  riderServiceFee: 50,  maxPassengers: 4 },
    { vehicleType: VehicleType.SUV,   country: "KE", basePrice: 200, pricePerKm: 70,  pricePerMin: 6,   minimumFare: 500,  riderServiceFee: 80,  maxPassengers: 6 },
    { vehicleType: VehicleType.TRUCK, country: "KE", basePrice: 400, pricePerKm: 120, pricePerMin: 10,  minimumFare: 800,  riderServiceFee: 150, maxPassengers: 2 },
];

// ── South Africa (ZAR) ──────────────────────────────────────────────
const ZA_PRICING: PricingRow[] = [
    { vehicleType: VehicleType.BIKE,  country: "ZA", basePrice: 10, pricePerKm: 5,  pricePerMin: 0.80, minimumFare: 30,  riderServiceFee: 6,  maxPassengers: 1 },
    { vehicleType: VehicleType.CAR,   country: "ZA", basePrice: 15, pricePerKm: 8,  pricePerMin: 1.20, minimumFare: 45,  riderServiceFee: 8,  maxPassengers: 4 },
    { vehicleType: VehicleType.SUV,   country: "ZA", basePrice: 25, pricePerKm: 13, pricePerMin: 1.80, minimumFare: 70,  riderServiceFee: 12, maxPassengers: 6 },
    { vehicleType: VehicleType.TRUCK, country: "ZA", basePrice: 50, pricePerKm: 22, pricePerMin: 3.00, minimumFare: 120, riderServiceFee: 25, maxPassengers: 2 },
];

// ── Tanzania (TZS) ──────────────────────────────────────────────────
const TZ_PRICING: PricingRow[] = [
    { vehicleType: VehicleType.BIKE,  country: "TZ", basePrice: 1000, pricePerKm: 350,  pricePerMin: 50,  minimumFare: 2500,  riderServiceFee: 500,  maxPassengers: 1 },
    { vehicleType: VehicleType.CAR,   country: "TZ", basePrice: 1500, pricePerKm: 600,  pricePerMin: 80,  minimumFare: 4000,  riderServiceFee: 700,  maxPassengers: 4 },
    { vehicleType: VehicleType.SUV,   country: "TZ", basePrice: 3000, pricePerKm: 1000, pricePerMin: 130, minimumFare: 7000,  riderServiceFee: 1200, maxPassengers: 6 },
    { vehicleType: VehicleType.TRUCK, country: "TZ", basePrice: 6000, pricePerKm: 1800, pricePerMin: 250, minimumFare: 12000, riderServiceFee: 2000, maxPassengers: 2 },
];

// ── Uganda (UGX) ────────────────────────────────────────────────────
const UG_PRICING: PricingRow[] = [
    { vehicleType: VehicleType.BIKE,  country: "UG", basePrice: 1500,  pricePerKm: 600,  pricePerMin: 80,  minimumFare: 3000,  riderServiceFee: 700,  maxPassengers: 1 },
    { vehicleType: VehicleType.CAR,   country: "UG", basePrice: 2500,  pricePerKm: 1000, pricePerMin: 130, minimumFare: 6000,  riderServiceFee: 1200, maxPassengers: 4 },
    { vehicleType: VehicleType.SUV,   country: "UG", basePrice: 5000,  pricePerKm: 1700, pricePerMin: 220, minimumFare: 10000, riderServiceFee: 2000, maxPassengers: 6 },
    { vehicleType: VehicleType.TRUCK, country: "UG", basePrice: 10000, pricePerKm: 3000, pricePerMin: 400, minimumFare: 18000, riderServiceFee: 3500, maxPassengers: 2 },
];

// ── India: ~83x USD (derived from the US book) ──────────────────────
function inPricing(): PricingRow[] {
    const m = 83;
    return US_PRICING.map(r => ({
        ...r,
        country: "IN",
        basePrice: +(r.basePrice * m).toFixed(2),
        pricePerKm: +(Number(r.pricePerKm) * m).toFixed(2),
        pricePerMin: +(r.pricePerMin * m).toFixed(2),
        minimumFare: +(r.minimumFare * m).toFixed(2),
        bookingFee: +(Number(r.bookingFee ?? 0) * m).toFixed(2),
    }));
}

// Legacy +20% increase - now applies ONLY to markets without an exact client book
// (GH/US/CA/NG are exact and exempt).
const FARE_INCREASE = 1.2;
function withIncrease(rows: PricingRow[]): PricingRow[] {
    return rows.map(r => ({
        ...r,
        basePrice: +(r.basePrice * FARE_INCREASE).toFixed(2),
        pricePerKm: +(Number(r.pricePerKm) * FARE_INCREASE).toFixed(4),
        pricePerMin: +(r.pricePerMin * FARE_INCREASE).toFixed(2),
        minimumFare: +(r.minimumFare * FARE_INCREASE).toFixed(2),
        bookingFee: +(Number(r.bookingFee ?? 0) * FARE_INCREASE).toFixed(2),
    }));
}

// Velo Priority tier = Velo Basic (car) x 1.25 (client range 1.16-1.35) wherever a
// country has no explicit priority row. Percent fee / levy carry over unchanged
// (the percent scales naturally with the larger base).
const PRIORITY_MULTIPLIER = 1.25;
function withPriority(rows: PricingRow[]): PricingRow[] {
    const countries = [...new Set(rows.map(r => r.country))];
    const extra: PricingRow[] = [];
    for (const country of countries) {
        const group = rows.filter(r => r.country === country);
        if (group.some(r => r.vehicleType === VehicleType.PRIORITY)) continue;
        const car = group.find(r => r.vehicleType === VehicleType.CAR);
        if (!car) continue;
        const m = PRIORITY_MULTIPLIER;
        extra.push({
            ...car,
            vehicleType: VehicleType.PRIORITY,
            basePrice: +(car.basePrice * m).toFixed(2),
            pricePerKm: +(Number(car.pricePerKm) * m).toFixed(4),
            pricePerMin: +(car.pricePerMin * m).toFixed(2),
            minimumFare: +(car.minimumFare * m).toFixed(2),
            bookingFee: +(Number(car.bookingFee ?? 0) * m).toFixed(2),
        });
    }
    return [...rows, ...extra];
}

const ALL_PRICING: PricingRow[] = withPriority([
    ...GH_PRICING,
    ...US_PRICING,
    ...CA_PRICING,
    ...NG_PRICING,
    ...withIncrease([
        ...KE_PRICING,
        ...ZA_PRICING,
        ...TZ_PRICING,
        ...UG_PRICING,
        ...inPricing(),
    ]),
]);

// ── Geofence surcharge zones (find-or-create; admin-editable afterwards) ──
const SURCHARGE_ZONES = [
    { name: "LOS Airport Dropoff", city: "Lagos", country: "NG", latitude: 6.5774, longitude: 3.3212, radius_km: 3, flatSurcharge: 1500.00 },
    { name: "Lekki-Ikoyi Link Bridge", city: "Lagos", country: "NG", latitude: 6.4478, longitude: 3.4344, radius_km: 1, flatSurcharge: 400.00 },
];

/** Read/write the applied pricing seed version from a tiny key-value table. */
async function getAppliedVersion(): Promise<number> {
    await AppDataSource.query(`CREATE TABLE IF NOT EXISTS seed_meta (key TEXT PRIMARY KEY, value TEXT)`);
    const rows = await AppDataSource.query(`SELECT value FROM seed_meta WHERE key = 'pricing_seed_version'`);
    return rows?.[0]?.value ? Number(rows[0].value) : 0;
}
async function setAppliedVersion(version: number): Promise<void> {
    await AppDataSource.query(
        `INSERT INTO seed_meta (key, value) VALUES ('pricing_seed_version', $1)
         ON CONFLICT (key) DO UPDATE SET value = $1`,
        [String(version)]
    );
}

/**
 * Seed vehicle_pricing rows + surcharge zones.
 * Full upsert ONLY when PRICING_SEED_VERSION increases; otherwise insert-missing-only
 * (protects admin dashboard edits from being clobbered on every boot).
 */
export async function seedVehiclePricing(alreadyInitialised = false) {
    if (!alreadyInitialised) {
        await AppDataSource.initialize();
    }

    // Auto-migrations (idempotent): columns synchronize does not reliably add.
    const columnMigrations = [
        `ALTER TABLE vehicle_pricing ADD COLUMN IF NOT EXISTS "riderServiceFee" DECIMAL(8,2) NOT NULL DEFAULT 1.99`,
        `ALTER TABLE vehicle_pricing ADD COLUMN IF NOT EXISTS "bookingFee" DECIMAL(8,2) NOT NULL DEFAULT 0`,
        `ALTER TABLE vehicle_pricing ADD COLUMN IF NOT EXISTS "bookingFeePercent" DECIMAL(5,2) NOT NULL DEFAULT 0`,
        `ALTER TABLE vehicle_pricing ADD COLUMN IF NOT EXISTS "roadLevy" DECIMAL(8,2) NOT NULL DEFAULT 0`,
        `ALTER TABLE zones ADD COLUMN IF NOT EXISTS "flatSurcharge" DECIMAL(10,2) NOT NULL DEFAULT 0`,
    ];
    for (const sql of columnMigrations) {
        try {
            await AppDataSource.query(sql);
        } catch (err) {
            console.warn("⚠️  column migration skipped:", (err as Error).message);
        }
    }

    // Auto-migration: ensure the vehicleType Postgres enum has every value.
    try {
        const rows: Array<{ enum_name: string }> = await AppDataSource.query(`
            SELECT t.typname AS enum_name
            FROM pg_type t
            JOIN pg_attribute a ON a.atttypid = t.oid
            JOIN pg_class c ON c.oid = a.attrelid
            JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE c.relname = 'vehicle_pricing' AND a.attname = 'vehicleType' AND n.nspname = 'public'
            LIMIT 1
        `);
        const enumName = rows?.[0]?.enum_name;
        if (enumName) {
            for (const value of Object.values(VehicleType)) {
                await AppDataSource.query(`ALTER TYPE "${enumName}" ADD VALUE IF NOT EXISTS '${value}'`);
            }
        }
    } catch (err) {
        console.warn("⚠️  vehicle type enum sync skipped:", (err as Error).message);
    }

    const repo = AppDataSource.getRepository(VehiclePricing);
    const appliedVersion = await getAppliedVersion();
    const fullUpsert = appliedVersion < PRICING_SEED_VERSION;

    let updated = 0;
    let created = 0;
    let skipped = 0;

    for (const data of ALL_PRICING) {
        const existing = await repo.findOne({
            where: { vehicleType: data.vehicleType, country: data.country },
        });

        if (existing) {
            if (fullUpsert) {
                Object.assign(existing, data);
                existing.isActive = true;
                await repo.save(existing);
                updated++;
            } else {
                skipped++; // preserve admin edits between price-book versions
            }
        } else {
            await repo.save(repo.create({ ...data, isActive: true }));
            created++;
        }
    }

    if (fullUpsert) {
        // New price book rollout: (re)activate every seeded market - Velo is global.
        await repo.createQueryBuilder().update().set({ isActive: true }).where("isActive = false").execute();
        await setAppliedVersion(PRICING_SEED_VERSION);
        console.log(`✅ vehicle_pricing: price book v${PRICING_SEED_VERSION} applied (${created} created, ${updated} updated)`);
    } else {
        console.log(`✓ vehicle_pricing: v${appliedVersion} current (${created} created, ${skipped} admin-managed rows untouched)`);
    }

    // Surcharge zones: find-or-create so admin edits persist.
    try {
        const zoneRepo = AppDataSource.getRepository(Zone);
        for (const z of SURCHARGE_ZONES) {
            const existing = await zoneRepo.findOne({ where: { name: z.name, country: z.country } });
            if (!existing) {
                await zoneRepo.save(zoneRepo.create({ ...z, status: "active" }));
                console.log(`✅ zone created: ${z.name} (+${z.flatSurcharge})`);
            }
        }
    } catch (err) {
        console.warn("⚠️  surcharge zone seeding skipped:", (err as Error).message);
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
