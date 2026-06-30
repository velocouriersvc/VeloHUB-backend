import { AppDataSource } from "../db/data-source";
import { PlatformSettings } from "../models/platform-settings";
import { MerchantProfile } from "../models/merchant-profile";
import { createServiceLogger } from "../utils/logger";
import {
    PricingVertical,
    resolveOrderVertical,
    computeDeliveryFee,
    MIN_BILLABLE_DISTANCE_KM,
} from "../config/pricing";

const log = createServiceLogger("DeliveryFeeService");

// Fallbacks - used when platform_settings is missing
const DEFAULT_BASE_FEE = 5.0;
const DEFAULT_PER_KM_FEE = 2.0;

export interface DeliveryFeeResult {
    deliveryFee: number;
    distanceKm: number;
    baseFee: number;
    perKmFee: number;
    estimatedDeliveryMin: number;
    vertical: PricingVertical;
    driverPayout: number;
    platformCommission: number;
    /** False when the merchant location was missing and a base-only fee was used. */
    locationResolved: boolean;
}

/**
 * DeliveryFeeService - calculate delivery fee based on Haversine distance
 * and per-country config from `platform_settings`.
 */
export class DeliveryFeeService {
    private settingsRepo = AppDataSource.getRepository(PlatformSettings);
    private merchantRepo = AppDataSource.getRepository(MerchantProfile);

    /**
     * Calculate delivery fee based on merchant location → delivery location distance.
     *
     * @param merchantId  The merchant's userId (to look up their lat/lng)
     * @param deliveryLat Customer's delivery latitude
     * @param deliveryLng Customer's delivery longitude
     * @param country     User's country code (resolves fee config from platform_settings)
     */
    async calculateDeliveryFee(
        merchantId: string,
        deliveryLat: number,
        deliveryLng: number,
        country: string = "GH",
        vertical?: PricingVertical
    ): Promise<DeliveryFeeResult> {
        // 1. Get merchant location
        const merchant = await this.merchantRepo.findOne({
            where: { userId: merchantId },
        });

        // 2. Resolve distance when we have both merchant and customer coordinates.
        //    If the merchant has no saved location (data not yet backfilled), we
        //    DO NOT fail the whole quote - we fall back to a base-fee-only delivery
        //    (distance 0) so the order can still be priced and placed. A warning is
        //    logged so the missing location can be fixed.
        let distanceKm = 0;
        let locationResolved = false;
        if (merchant?.latitude && merchant?.longitude) {
            distanceKm = this.haversineDistance(
                merchant.latitude,
                merchant.longitude,
                deliveryLat,
                deliveryLng
            );
            locationResolved = true;
        } else {
            log.warn("Merchant location unavailable - using base delivery fee only", {
                merchantId,
                hasMerchant: !!merchant,
            });
        }

        // 3. Get fee config from platform_settings
        const settings = await this.settingsRepo.findOne({
            where: { country, isActive: true },
        });

        const rawBaseFee = settings ? Number(settings.deliveryBaseFee) : DEFAULT_BASE_FEE;
        const rawPerKmFee = settings ? Number(settings.deliveryPerKmFee) : DEFAULT_PER_KM_FEE;
        const driverShareRate = settings ? Number(settings.driverDeliveryFeeShare) / 100 : 0.75;

        // 4. Resolve the pricing vertical (food vs marketplace) from the merchant
        //    category unless the caller pins it explicitly, then apply the
        //    cross-vertical base/distance weighting via the pure helper.
        const resolvedVertical = vertical ?? resolveOrderVertical(merchant?.category);
        // For a real (resolved) distance, bill at least the minimum billable distance
        // so sub-1km deliveries aren't under-charged. When the location is unknown we
        // keep distance 0 (base-only fallback).
        const billableKm = locationResolved
            ? Math.max(distanceKm, MIN_BILLABLE_DISTANCE_KM)
            : distanceKm;
        const fee = computeDeliveryFee({
            baseFee: rawBaseFee,
            perKmFee: rawPerKmFee,
            distanceKm: billableKm,
            vertical: resolvedVertical,
            driverShareRate,
        });

        // 5. Estimate delivery time (rough: 3 min/km + 10 min pickup/dropoff buffer)
        const estimatedDeliveryMin = Math.ceil(distanceKm * 3 + 10);

        log.info("Delivery fee calculated", {
            merchantId,
            distanceKm: Math.round(distanceKm * 100) / 100,
            deliveryFee: fee.deliveryFee,
            vertical: resolvedVertical,
            country,
        });

        return {
            deliveryFee: fee.deliveryFee,
            distanceKm: Math.round(distanceKm * 100) / 100,
            baseFee: fee.baseFee,
            perKmFee: rawPerKmFee,
            estimatedDeliveryMin,
            vertical: resolvedVertical,
            driverPayout: fee.driverPayout,
            platformCommission: fee.platformCommission,
            locationResolved,
        };
    }

    /**
     * Calculate the Haversine distance between two coordinates (in km).
     */
    private haversineDistance(
        lat1: number,
        lng1: number,
        lat2: number,
        lng2: number
    ): number {
        const R = 6371; // Earth's radius in km
        const dLat = this.toRad(lat2 - lat1);
        const dLng = this.toRad(lng2 - lng1);

        const a =
            Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(this.toRad(lat1)) * Math.cos(this.toRad(lat2)) *
            Math.sin(dLng / 2) * Math.sin(dLng / 2);

        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }

    private toRad(deg: number): number {
        return deg * (Math.PI / 180);
    }
}
