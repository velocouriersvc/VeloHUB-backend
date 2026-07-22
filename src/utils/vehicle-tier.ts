import { VehicleType } from "../models/vehicle-pricing";

/**
 * Vehicle tiers ordered smallest to largest. A driver may take any job whose required
 * tier is at or below their own vehicle. PRIORITY is a car-sized premium tier, so it
 * carries the same capacity rank as CAR.
 */
const TIER_RANK: Record<string, number> = {
    [VehicleType.BIKE]: 0,
    [VehicleType.CAR]: 1,
    [VehicleType.PRIORITY]: 1,
    [VehicleType.SUV]: 2,
    [VehicleType.TRUCK]: 3,
};

export function tierRank(tier?: string | null): number {
    if (!tier) return 0;
    return TIER_RANK[String(tier).toLowerCase()] ?? 1;
}

/** True when a driver's vehicle can carry a job requiring `required`. */
export function vehicleMeetsTier(driverVehicle?: string | null, required?: string | null): boolean {
    if (!required) return true;
    return tierRank(driverVehicle) >= tierRank(required);
}

export interface CartItemDimensions {
    lengthIn?: number | null;
    widthIn?: number | null;
    heightIn?: number | null;
    weightLb?: number | null;
    isFragile?: boolean | null;
    isPerishable?: boolean | null;
    requiresOpenAir?: boolean | null;
    quantity: number;
}

const CUBIC_IN_PER_CUBIC_FT = 1728;

/**
 * Compute the minimum vehicle tier a cart needs.
 *
 * Deliberately simple (no true 3D bin-packing): total weight, a stacked-volume estimate,
 * and the largest single dimension across items. Handling flags escalate the tier.
 * Items with no dimensions recorded contribute nothing to the size estimate, so a cart
 * where nothing is measured falls back to CAR rather than under-dispatching to a bike.
 *
 * Thresholds:
 *   BIKE  <= 10 lb, <= 0.5 ft3, longest side <= 18 in, no handling flags
 *   CAR   <= 100 lb, <= 10 ft3, longest side <= 48 in
 *   SUV   <= 300 lb, <= 35 ft3, or fragile / open-air
 *   TRUCK anything larger
 */
export function computeRequiredVehicleTier(items: CartItemDimensions[]): VehicleType {
    if (!items.length) return VehicleType.CAR;

    let totalWeight = 0;
    let totalVolumeCuIn = 0;
    let longestSide = 0;
    let anyFragile = false;
    let anyOpenAir = false;
    let measuredItems = 0;

    for (const item of items) {
        const qty = Math.max(1, Number(item.quantity) || 1);
        const l = Number(item.lengthIn || 0);
        const w = Number(item.widthIn || 0);
        const h = Number(item.heightIn || 0);
        const weight = Number(item.weightLb || 0);

        totalWeight += weight * qty;
        if (l > 0 && w > 0 && h > 0) {
            totalVolumeCuIn += l * w * h * qty;
            longestSide = Math.max(longestSide, l, w, h);
            measuredItems++;
        }
        if (item.isFragile) anyFragile = true;
        if (item.requiresOpenAir) anyOpenAir = true;
    }

    // Nothing measurable and nothing heavy: default to CAR rather than guessing small.
    if (measuredItems === 0 && totalWeight === 0) return VehicleType.CAR;

    const volumeCuFt = totalVolumeCuIn / CUBIC_IN_PER_CUBIC_FT;

    if (totalWeight > 300 || volumeCuFt > 35 || longestSide > 96) return VehicleType.TRUCK;
    if (totalWeight > 100 || volumeCuFt > 10 || longestSide > 48 || anyFragile || anyOpenAir) {
        return VehicleType.SUV;
    }
    if (totalWeight > 10 || volumeCuFt > 0.5 || longestSide > 18) return VehicleType.CAR;
    return VehicleType.BIKE;
}
