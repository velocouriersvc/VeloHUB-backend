import { AppDataSource } from "../db/data-source";
import { PlatformSettings } from "../models/platform-settings";

/**
 * VeloHUB Platform Settings - exact client-specified rates.
 * UPDATED: April 22, 2026
 *
 * Rider Service Fees:
 * - USA: $1.99
 * - Ghana: GH₵ 4.00
 * - Nigeria: ₦400.00
 *
 * IMPORTANT: Delivery rates use PER-MILE values converted to per-km internally.
 * Client quotes "$0.60/mile" → stored as ~$0.3728/km (÷ 1.60934).
 * The delivery-fee-service calculates in km (Haversine) so we store km values.
 *
 * All percentages stored as whole numbers (15 = 15%).
 * All absolute fee values stored in local currency.
 */

const MI_TO_KM = 1.60934;

const SETTINGS: Partial<PlatformSettings>[] = [
    // ── United States (USD) ─────────────────────────────────────────
    {
        country: "US",
        usdExchangeRate: 1,
        currency: "USD",
        minimumOrderValue: 0,

        // Delivery / Orders
        defaultCommissionRate: 15.00,       // Merchant keeps 85%
        defaultServiceFeeRate: 5.00,        // 5% of subtotal
        serviceFeeMaxCap: 4.99,             // capped at $4.99
        smallOrderFee: 2.99,                // if subtotal < $15
        smallOrderThreshold: 15.00,
        defaultPickupFeeRate: 10.00,
        deliveryBaseFee: 3.49,              // $3.49 base
        deliveryPerKmFee: +(0.60 / MI_TO_KM).toFixed(4) as any, // $0.60/mile → per km
        driverDeliveryFeeShare: 85.00,      // Driver gets 85% of delivery fee (per formula & examples)

        // Rides
        rideCommissionRate: 15.00,          // VeloHUB takes 15%, driver keeps 85%
        riderServiceFee: 1.99,              // flat $1.99 on top of ride fare
        maxSurgeMultiplier: 1.40,            // Surge protection cap (never exceed 1.4x)

        // Delivery rides (order+driver combined)
        deliveryTotalCommissionRate: 40.00,
        deliveryRidePortionRate: 50.00,
        deliveryServicePortionRate: 50.00,

        // Services / Bookings
        serviceCommissionRate: 15.00,       // Provider keeps 85%
        serviceBookingFee: 0.00,            // $0 - free to book
        lateCancellationFee: 5.00,
        lateCancellationFeeMax: 10.00,
        cancellationWindowMinutes: 60,      // 1hr before scheduled service

        // General
        referralRewardAmount: 5.00,
        leaderboardLimit: 10,
        isGlobalSurgeActive: false,
        globalSurgeMultiplier: 1.00,
        isActive: true,
    },

    // ── Ghana (GHS) ─────────────────────────────────────────────────
    // ACTUAL production rates (client-specified, NOT auto-calculated)
    {
        country: "GH",
        usdExchangeRate: 15.5,
        currency: "GHS",
        minimumOrderValue: 0,

        defaultCommissionRate: 15.00,
        defaultServiceFeeRate: 5.00,
        serviceFeeMaxCap: 79.84,            // ~$4.99 × 16
        smallOrderFee: 5.00,                // flat, market-appropriate (was 47.84, a blind 16x USD conversion)
        smallOrderThreshold: 50.00,         // fee applies only below 50 GHS
        defaultPickupFeeRate: 10.00,
        deliveryBaseFee: 55.84,             // ~$3.49 × 16
        deliveryPerKmFee: +(9.60 / MI_TO_KM).toFixed(4) as any, // ~$0.60×16/mile → per km
        driverDeliveryFeeShare: 75.00,

        rideCommissionRate: 15.00,
        riderServiceFee: 4.00,              // ✅ ACTUAL Ghana rider service fee
        maxSurgeMultiplier: 1.40,            // Surge protection cap (never exceed 1.4x)

        deliveryTotalCommissionRate: 40.00,
        deliveryRidePortionRate: 50.00,
        deliveryServicePortionRate: 50.00,

        serviceCommissionRate: 15.00,
        serviceBookingFee: 0.00,
        lateCancellationFee: 80.00,
        lateCancellationFeeMax: 160.00,
        cancellationWindowMinutes: 60,

        referralRewardAmount: 80.00,
        leaderboardLimit: 10,
        isGlobalSurgeActive: false,
        globalSurgeMultiplier: 1.00,
        isActive: true,
    },

    // ── Nigeria (NGN) - client-specified custom rates ───────────────
    {
        country: "NG",
        usdExchangeRate: 1550,
        currency: "NGN",
        minimumOrderValue: 0,

        // Delivery / Orders
        defaultCommissionRate: 15.00,
        defaultServiceFeeRate: 5.00,        // 5% of subtotal
        serviceFeeMaxCap: 1500.00,          // capped at ₦1,500
        smallOrderFee: 800.00,              // ₦800 if subtotal < ₦12,000
        smallOrderThreshold: 12000.00,
        defaultPickupFeeRate: 10.00,
        deliveryBaseFee: 500.00,            // ₦500 base
        deliveryPerKmFee: 120.00,           // ₦120/km (client specified per-km directly)
        driverDeliveryFeeShare: 75.00,

        // Rides - client-specified Nigeria rates (UPDATED April 22, 2026)
        rideCommissionRate: 15.00,
        riderServiceFee: 400.00,            // ₦400 flat (updated from ₦300)
        maxSurgeMultiplier: 1.40,            // Surge protection cap (never exceed 1.4x)

        deliveryTotalCommissionRate: 40.00,
        deliveryRidePortionRate: 50.00,
        deliveryServicePortionRate: 50.00,

        // Services
        serviceCommissionRate: 15.00,
        serviceBookingFee: 0.00,
        lateCancellationFee: 2000.00,
        lateCancellationFeeMax: 5000.00,
        cancellationWindowMinutes: 60,

        referralRewardAmount: 2000.00,
        leaderboardLimit: 10,
        isGlobalSurgeActive: false,
        globalSurgeMultiplier: 1.00,
        isActive: true,
    },

    // ── Kenya (KES) - competitive Nairobi rates ⚠️ validate before launch ──
    {
        country: "KE",
        usdExchangeRate: 129,
        currency: "KES",
        minimumOrderValue: 0,

        defaultCommissionRate: 15.00,
        defaultServiceFeeRate: 5.00,
        serviceFeeMaxCap: 650.00,           // ~$5
        smallOrderFee: 390.00,              // ~$3 if subtotal < ~$15
        smallOrderThreshold: 2000.00,       // ~$15
        defaultPickupFeeRate: 10.00,
        deliveryBaseFee: 100.00,
        deliveryPerKmFee: 45.00,
        driverDeliveryFeeShare: 75.00,

        rideCommissionRate: 15.00,
        riderServiceFee: 50.00,
        maxSurgeMultiplier: 1.40,            // Surge protection cap (never exceed 1.4x)

        deliveryTotalCommissionRate: 40.00,
        deliveryRidePortionRate: 50.00,
        deliveryServicePortionRate: 50.00,

        serviceCommissionRate: 15.00,
        serviceBookingFee: 0.00,
        lateCancellationFee: 130.00,
        lateCancellationFeeMax: 260.00,
        cancellationWindowMinutes: 60,

        referralRewardAmount: 650.00,
        leaderboardLimit: 10,
        isGlobalSurgeActive: false,
        globalSurgeMultiplier: 1.00,
        isActive: true,
    },

    // ── South Africa (ZAR) - competitive rates ⚠️ validate before launch ──
    {
        country: "ZA",
        usdExchangeRate: 18,
        currency: "ZAR",
        minimumOrderValue: 0,

        defaultCommissionRate: 15.00,
        defaultServiceFeeRate: 5.00,
        serviceFeeMaxCap: 90.00,            // ~$5
        smallOrderFee: 55.00,               // ~$3
        smallOrderThreshold: 270.00,        // ~$15
        defaultPickupFeeRate: 10.00,
        deliveryBaseFee: 25.00,
        deliveryPerKmFee: 8.00,
        driverDeliveryFeeShare: 75.00,

        rideCommissionRate: 15.00,
        riderServiceFee: 8.00,
        maxSurgeMultiplier: 1.40,            // Surge protection cap (never exceed 1.4x)

        deliveryTotalCommissionRate: 40.00,
        deliveryRidePortionRate: 50.00,
        deliveryServicePortionRate: 50.00,

        serviceCommissionRate: 15.00,
        serviceBookingFee: 0.00,
        lateCancellationFee: 90.00,
        lateCancellationFeeMax: 180.00,
        cancellationWindowMinutes: 60,

        referralRewardAmount: 90.00,
        leaderboardLimit: 10,
        isGlobalSurgeActive: false,
        globalSurgeMultiplier: 1.00,
        isActive: true,
    },

    // ── Tanzania (TZS) - competitive Dar es Salaam rates ⚠️ validate ──
    {
        country: "TZ",
        usdExchangeRate: 2650,
        currency: "TZS",
        minimumOrderValue: 0,

        defaultCommissionRate: 15.00,
        defaultServiceFeeRate: 5.00,
        serviceFeeMaxCap: 13000.00,         // ~$5
        smallOrderFee: 7800.00,             // ~$3
        smallOrderThreshold: 39000.00,      // ~$15
        defaultPickupFeeRate: 10.00,
        deliveryBaseFee: 2500.00,
        deliveryPerKmFee: 800.00,
        driverDeliveryFeeShare: 75.00,

        rideCommissionRate: 15.00,
        riderServiceFee: 700.00,
        maxSurgeMultiplier: 1.40,            // Surge protection cap (never exceed 1.4x)

        deliveryTotalCommissionRate: 40.00,
        deliveryRidePortionRate: 50.00,
        deliveryServicePortionRate: 50.00,

        serviceCommissionRate: 15.00,
        serviceBookingFee: 0.00,
        lateCancellationFee: 13000.00,
        lateCancellationFeeMax: 26000.00,
        cancellationWindowMinutes: 60,

        referralRewardAmount: 13000.00,
        leaderboardLimit: 10,
        isGlobalSurgeActive: false,
        globalSurgeMultiplier: 1.00,
        isActive: true,
    },

    // ── Uganda (UGX) - competitive Kampala rates ⚠️ validate ──────────
    {
        country: "UG",
        usdExchangeRate: 3700,
        currency: "UGX",
        minimumOrderValue: 0,

        defaultCommissionRate: 15.00,
        defaultServiceFeeRate: 5.00,
        serviceFeeMaxCap: 19000.00,         // ~$5
        smallOrderFee: 11400.00,            // ~$3
        smallOrderThreshold: 57000.00,      // ~$15
        defaultPickupFeeRate: 10.00,
        deliveryBaseFee: 3500.00,
        deliveryPerKmFee: 1000.00,
        driverDeliveryFeeShare: 75.00,

        rideCommissionRate: 15.00,
        riderServiceFee: 1200.00,
        maxSurgeMultiplier: 1.40,            // Surge protection cap (never exceed 1.4x)

        deliveryTotalCommissionRate: 40.00,
        deliveryRidePortionRate: 50.00,
        deliveryServicePortionRate: 50.00,

        serviceCommissionRate: 15.00,
        serviceBookingFee: 0.00,
        lateCancellationFee: 19000.00,
        lateCancellationFeeMax: 38000.00,
        cancellationWindowMinutes: 60,

        referralRewardAmount: 19000.00,
        leaderboardLimit: 10,
        isGlobalSurgeActive: false,
        globalSurgeMultiplier: 1.00,
        isActive: true,
    },

    // ── Canada (CAD) ────────────────────────────────────────────────
    {
        country: "CA",
        usdExchangeRate: 1.37,
        currency: "CAD",
        minimumOrderValue: 0,

        defaultCommissionRate: 15.00,
        defaultServiceFeeRate: 5.00,
        serviceFeeMaxCap: 6.99,
        smallOrderFee: 3.99,
        smallOrderThreshold: 20.00,
        defaultPickupFeeRate: 10.00,
        deliveryBaseFee: 4.49,
        deliveryPerKmFee: +(0.80 / MI_TO_KM).toFixed(4) as any,
        driverDeliveryFeeShare: 75.00,

        rideCommissionRate: 15.00,
        riderServiceFee: 2.49,
        maxSurgeMultiplier: 1.40,            // Surge protection cap (never exceed 1.4x)

        deliveryTotalCommissionRate: 40.00,
        deliveryRidePortionRate: 50.00,
        deliveryServicePortionRate: 50.00,

        serviceCommissionRate: 15.00,
        serviceBookingFee: 0.00,
        lateCancellationFee: 7.00,
        lateCancellationFeeMax: 14.00,
        cancellationWindowMinutes: 60,

        referralRewardAmount: 7.00,
        leaderboardLimit: 10,
        isGlobalSurgeActive: false,
        globalSurgeMultiplier: 1.00,
        isActive: true,
    },

    // ── India (INR) ─────────────────────────────────────────────────
    {
        country: "IN",
        usdExchangeRate: 86,
        currency: "INR",
        minimumOrderValue: 0,

        defaultCommissionRate: 15.00,
        defaultServiceFeeRate: 5.00,
        serviceFeeMaxCap: 399.00,
        smallOrderFee: 249.00,
        smallOrderThreshold: 1200.00,
        defaultPickupFeeRate: 8.00,
        deliveryBaseFee: 29.00,
        deliveryPerKmFee: 10.00,
        driverDeliveryFeeShare: 75.00,

        rideCommissionRate: 15.00,
        riderServiceFee: 49.00,
        maxSurgeMultiplier: 1.40,            // Surge protection cap (never exceed 1.4x)

        deliveryTotalCommissionRate: 40.00,
        deliveryRidePortionRate: 50.00,
        deliveryServicePortionRate: 50.00,

        serviceCommissionRate: 15.00,
        serviceBookingFee: 0.00,
        lateCancellationFee: 200.00,
        lateCancellationFeeMax: 500.00,
        cancellationWindowMinutes: 60,

        referralRewardAmount: 200.00,
        leaderboardLimit: 10,
        isGlobalSurgeActive: false,
        globalSurgeMultiplier: 1.00,
        isActive: true,
    },
];

/**
 * Seed platform_settings rows.
 * UPSERTS - existing rows are UPDATED to match the latest config.
 */
export const PLATFORM_SETTINGS_SEED_VERSION = 3;

async function getAppliedVersion(): Promise<number> {
    await AppDataSource.query(`CREATE TABLE IF NOT EXISTS seed_meta (key TEXT PRIMARY KEY, value TEXT)`);
    const rows = await AppDataSource.query(`SELECT value FROM seed_meta WHERE key = 'platform_settings_seed_version'`);
    return rows.length ? Number(rows[0].value) || 0 : 0;
}

async function setAppliedVersion(version: number): Promise<void> {
    await AppDataSource.query(
        `INSERT INTO seed_meta (key, value) VALUES ('platform_settings_seed_version', $1)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
        [String(version)]
    );
}

export async function seedPlatformSettings(alreadyInitialised = false) {
    if (!alreadyInitialised) {
        await AppDataSource.initialize();
    }

    const repo = AppDataSource.getRepository(PlatformSettings);

    // Admin edits in the dashboard must SURVIVE restarts: rows are fully
    // re-applied only when PLATFORM_SETTINGS_SEED_VERSION increases; otherwise
    // only missing countries are inserted.
    const appliedVersion = await getAppliedVersion();
    const fullUpsert = appliedVersion < PLATFORM_SETTINGS_SEED_VERSION;

    // Client-requested 20% increase on delivery pricing (June 2026). Applied to the
    // static config on each upsert so it is idempotent and never compounds.
    const DELIVERY_INCREASE = 1.2;
    const scaleFee = (v: any) => v == null ? v : +(Number(v) * DELIVERY_INCREASE).toFixed(4);

    let upserted = 0;
    for (const data of SETTINGS) {
        const row = {
            ...data,
            deliveryBaseFee: scaleFee(data.deliveryBaseFee),
            deliveryPerKmFee: scaleFee(data.deliveryPerKmFee),
        };
        const existing = await repo.findOne({ where: { country: row.country! } });
        if (existing) {
            if (fullUpsert) {
                Object.assign(existing, row);
                await repo.save(existing);
                upserted++;
            }
        } else {
            await repo.save(repo.create(row));
            upserted++;
        }
    }

    console.log(`✅ platform_settings: upserted ${upserted} rows`);

    // Velo operates globally now. Re-activate every seeded market and ensure a global
    // "DEFAULT" (USD) row exists as the fallback for any country without a specific row.
    await repo.createQueryBuilder().update().set({ isActive: true }).where("isActive = false").execute();
    const hasDefault = await repo.findOne({ where: { country: "DEFAULT" } });
    if (!hasDefault) {
        const us = await repo.findOne({ where: { country: "US" } });
        if (us) {
            const { id, ...rest } = us as any;
            await repo.save(repo.create({ ...rest, country: "DEFAULT", currency: "USD", isActive: true }));
            console.log("✅ platform_settings: created global DEFAULT (USD) fallback row");
        }
    }

    if (fullUpsert) {
        await setAppliedVersion(PLATFORM_SETTINGS_SEED_VERSION);
        console.log(`✅ platform_settings: seed v${PLATFORM_SETTINGS_SEED_VERSION} applied`);
    }

    if (!alreadyInitialised) {
        await AppDataSource.destroy();
    }
}

if (require.main === module) {
    seedPlatformSettings(false)
        .then(() => console.log("Done - platform_settings seeded."))
        .catch(console.error);
}
