/**
 * Velo Dynamic Pricing Configuration
 * ===================================
 *
 * Single source of truth for the fare / fee ALGORITHM (the structural business
 * rules that rarely change). The per-country *numbers* (base fare, per-km, etc.)
 * live in the database (`vehicle_pricing`, `platform_settings`) so ops can tune
 * them without a deploy. This module owns:
 *
 *   1. The customer service fee rate (5%) and platform commission / driver
 *      deduction (15% / 85%) used as defaults when the DB has no override.
 *   2. The surge protection cap (max 1.4x) - "never gouge the customer".
 *   3. The cross-vertical multiplier matrix (rides / food / package / marketplace).
 *   4. The PURE, side-effect-free `computeRideFare` and `computeDeliveryFee`
 *      functions that every service and test calls, so the math is computed in
 *      exactly one place.
 *
 * Reference fare architecture (client spec):
 *   Trip Subtotal = Base + (PerKm x Distance) + (PerMin x Time)
 *   Surged        = Trip Subtotal x Surge        (Surge capped at MAX_SURGE)
 *   Service Fee   = Surged x 5%                   (100% to platform, fixed even at peak)
 *   Rider Pays    = Surged x 1.05                 (then floored at the minimum fare)
 *   Driver Gets   = Surged x 85%
 *   Platform Gets = Service Fee + (Surged x 15%)
 */

// ── Core rates (defaults; DB platform_settings can override per country) ──

/** Customer-facing service fee as a fraction of the subtotal (5%). */
export const SERVICE_FEE_RATE = 0.05;

/** Platform commission as a fraction of the subtotal (15%) - driver keeps 85%. */
export const PLATFORM_COMMISSION_RATE = 0.15;

/** Driver take-home as a fraction of the subtotal (85%). */
export const DRIVER_PAYOUT_RATE = 1 - PLATFORM_COMMISSION_RATE;

/**
 * Surge protection cap. Competitors spike to 3.0x in peak/rain; we never exceed
 * 1.4x. The 5% service fee stays fixed even during surge (surge applies only to
 * the trip subtotal, never to the service fee).
 */
export const MAX_SURGE_MULTIPLIER = 1.4;

/**
 * Minimum billable distance (km). Very short trips (e.g. pickup ~= dropoff, or a
 * 0.1 km route) are billed as if they were this distance, so a delivery always
 * reflects at least a standard 1 km of travel before the per-vehicle minimum fare
 * is applied. Keeps short deliveries fairly priced instead of near-zero.
 */
export const MIN_BILLABLE_DISTANCE_KM = 1;

// ── Cross-vertical pricing matrix ────────────────────────────────────────

export enum PricingVertical {
    RIDES = "rides",
    FOOD = "food",
    PACKAGE = "package",
    MARKETPLACE = "marketplace",
}

export interface VerticalProfile {
    /** Multiplier applied to the base fare. */
    baseMultiplier: number;
    /** Multiplier applied to the per-km rate. */
    perKmMultiplier: number;
    /** Multiplier applied to the per-min rate (0 = distance-only, ignore time). */
    perMinMultiplier: number;
    /** Human-readable rationale (kept with the data for maintainers). */
    rationale: string;
}

/**
 * Apply the 15% / 5% framework across verticals using modified base & distance
 * weights. Keeps each vertical competitive against the right rival tier.
 */
export const VERTICAL_PROFILES: Record<PricingVertical, VerticalProfile> = {
    // Standard ride - the reference baseline. Competes with Bolt/Yango economy.
    [PricingVertical.RIDES]: {
        baseMultiplier: 1.0,
        perKmMultiplier: 1.0,
        perMinMultiplier: 1.0,
        rationale: "Standard. Keeps base competitive with Bolt/Yango economy tiers.",
    },
    // Food delivery - cheap entry, heavy km reliance; monetized via merchant commission.
    [PricingVertical.FOOD]: {
        baseMultiplier: 0.8,
        perKmMultiplier: 1.2,
        perMinMultiplier: 1.0,
        rationale: "0.8x base, heavy km reliance. Cheap entry; monetize via merchant commission.",
    },
    // Package delivery - higher base for loading/unloading labor.
    [PricingVertical.PACKAGE]: {
        baseMultiplier: 1.2,
        perKmMultiplier: 1.0,
        perMinMultiplier: 1.0,
        rationale: "1.2x base, drop-off fee scaling. Accounts for loading/unloading labor.",
    },
    // Marketplace - distance only; pooled routing lets couriers stack orders.
    [PricingVertical.MARKETPLACE]: {
        baseMultiplier: 0.7,
        perKmMultiplier: 1.0,
        perMinMultiplier: 0.0,
        rationale: "0.7x base, distance only. Pooled routing lets couriers stack orders.",
    },
};

export function getVerticalProfile(vertical: PricingVertical = PricingVertical.RIDES): VerticalProfile {
    return VERTICAL_PROFILES[vertical] ?? VERTICAL_PROFILES[PricingVertical.RIDES];
}

/** Merchant categories treated as "food" (everything else => marketplace). */
const FOOD_CATEGORIES = new Set([
    "food", "foods", "restaurant", "restaurants", "fast_food", "fastfood",
    "grocery", "groceries", "supermarket", "drinks", "food_drinks", "bakery", "cafe",
]);

/** Map a merchant's free-form category to its pricing vertical. */
export function resolveOrderVertical(merchantCategory?: string | null): PricingVertical {
    if (!merchantCategory) return PricingVertical.MARKETPLACE;
    return FOOD_CATEGORIES.has(merchantCategory.trim().toLowerCase())
        ? PricingVertical.FOOD
        : PricingVertical.MARKETPLACE;
}

// ── Pure computation helpers ─────────────────────────────────────────────

/** Round to 2 decimal places (currency). */
export function round2(n: number): number {
    return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Clamp a surge multiplier into [1, cap]. */
export function clampSurge(surge: number, cap: number = MAX_SURGE_MULTIPLIER): number {
    if (!Number.isFinite(surge)) return 1;
    return Math.min(Math.max(surge, 1), cap);
}

export interface RideFareInput {
    /** Raw per-country rates (from vehicle_pricing). */
    basePrice: number;
    pricePerKm: number;
    pricePerMin: number;
    distanceKm: number;
    durationMin: number;
    minimumFare?: number;
    /** Flat booking fee added to the fare (base + distance + time + booking). */
    bookingFee?: number;
    /** Raw surge (uncapped); will be clamped to [1, maxSurge]. */
    surgeMultiplier?: number;
    maxSurge?: number;
    /** Fee/commission overrides (fractions, e.g. 0.05). Default to module constants. */
    serviceFeeRate?: number;
    commissionRate?: number;
    /** Vertical weighting (defaults to RIDES = 1x). */
    vertical?: PricingVertical;
    /** Absolute discount to subtract from the rider total (e.g. promo). */
    discountAmount?: number;
}

export interface RideFareResult {
    baseFare: number;
    distanceCost: number;
    timeCost: number;
    subtotal: number;          // base + distance + time (after vertical weighting, before surge)
    surgeMultiplier: number;   // the clamped surge actually applied
    surgeAmount: number;       // extra charged due to surge
    effectiveSubtotal: number; // surged subtotal that the 15/85 split is computed from
    serviceFee: number;        // 5% of effective subtotal (100% to platform)
    riderTotal: number;        // effective subtotal + service fee (before discount, after min-fare floor)
    discountAmount: number;
    finalFare: number;         // what the rider pays
    driverPayout: number;      // 85% of effective subtotal
    commissionOnly: number;    // 15% of effective subtotal (commission portion only, excludes service fee)
    platformCommission: number;// total platform share = service fee + commissionOnly
}

/**
 * Compute a full ride/delivery fare breakdown. Pure - no DB, no clock, no I/O.
 * This is THE fare formula; every caller funnels through it.
 */
export function computeRideFare(input: RideFareInput): RideFareResult {
    const profile = getVerticalProfile(input.vertical);
    const serviceFeeRate = input.serviceFeeRate ?? SERVICE_FEE_RATE;
    const commissionRate = input.commissionRate ?? PLATFORM_COMMISSION_RATE;
    const surge = clampSurge(input.surgeMultiplier ?? 1, input.maxSurge ?? MAX_SURGE_MULTIPLIER);

    // Floor the billable distance so near-zero trips still pay for a standard 1 km.
    const billableKm = Math.max(input.distanceKm, MIN_BILLABLE_DISTANCE_KM);

    const baseFare = round2(input.basePrice * profile.baseMultiplier);
    const distanceCost = round2(input.pricePerKm * profile.perKmMultiplier * billableKm);
    const timeCost = round2(input.pricePerMin * profile.perMinMultiplier * input.durationMin);
    // Flat booking fee is part of the fare (and therefore the driver's 85% share).
    const bookingFee = round2(input.bookingFee ?? 0);
    const subtotal = round2(baseFare + distanceCost + timeCost + bookingFee);

    const surgedSubtotal = round2(subtotal * surge);
    const surgeAmount = round2(surgedSubtotal - subtotal);

    let serviceFee = round2(surgedSubtotal * serviceFeeRate);
    let riderTotal = round2(surgedSubtotal + serviceFee);
    let effectiveSubtotal = surgedSubtotal;

    // Floor the rider total at the minimum fare, keeping the identity
    // riderTotal = effectiveSubtotal + serviceFee so the 15/85 split stays exact.
    const minimumFare = input.minimumFare ?? 0;
    if (riderTotal < minimumFare) {
        riderTotal = round2(minimumFare);
        effectiveSubtotal = round2(riderTotal / (1 + serviceFeeRate));
        serviceFee = round2(riderTotal - effectiveSubtotal);
    }

    const discountAmount = round2(Math.min(Math.max(input.discountAmount ?? 0, 0), riderTotal));
    const finalFare = round2(Math.max(riderTotal - discountAmount, 0));

    const driverPayout = round2(effectiveSubtotal * (1 - commissionRate));
    const commissionOnly = round2(effectiveSubtotal * commissionRate);
    const platformCommission = round2(serviceFee + commissionOnly);

    return {
        baseFare,
        distanceCost,
        timeCost,
        subtotal,
        surgeMultiplier: surge,
        surgeAmount,
        effectiveSubtotal,
        serviceFee,
        riderTotal,
        discountAmount,
        finalFare,
        driverPayout,
        commissionOnly,
        platformCommission,
    };
}

export interface DeliveryFeeInput {
    baseFee: number;
    perKmFee: number;
    distanceKm: number;
    vertical?: PricingVertical;
    /** Driver share of the delivery fee as a fraction (e.g. 0.75). */
    driverShareRate?: number;
}

export interface DeliveryFeeResult {
    baseFee: number;       // base after vertical weighting
    distanceCost: number;  // distance fee after vertical weighting
    deliveryFee: number;   // total customer-facing delivery fee
    driverPayout: number;
    platformCommission: number;
    vertical: PricingVertical;
}

/**
 * Compute a delivery fee with cross-vertical weighting. Pure.
 * Delivery fees have no time component, so the marketplace "distance only"
 * profile simply uses base x 0.7 + distance.
 */
export function computeDeliveryFee(input: DeliveryFeeInput): DeliveryFeeResult {
    const vertical = input.vertical ?? PricingVertical.PACKAGE;
    const profile = getVerticalProfile(vertical);
    const driverShareRate = input.driverShareRate ?? DRIVER_PAYOUT_RATE;

    const baseFee = round2(input.baseFee * profile.baseMultiplier);
    const distanceCost = round2(input.perKmFee * profile.perKmMultiplier * input.distanceKm);
    const deliveryFee = round2(baseFee + distanceCost);

    const driverPayout = round2(deliveryFee * driverShareRate);
    const platformCommission = round2(deliveryFee - driverPayout);

    return { baseFee, distanceCost, deliveryFee, driverPayout, platformCommission, vertical };
}
