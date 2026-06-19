import { AppDataSource } from "../db/data-source";
import { PlatformSettings } from "../models/platform-settings";
import { MerchantProfile } from "../models/merchant-profile";
import { createServiceLogger } from "../utils/logger";
import {
    PricingVertical,
    resolveOrderVertical,
    computeDeliveryFee,
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

        if (!merchant) {
            throw new Error("Merchant profile not found");
        }

        if (!merchant.latitude || !merchant.longitude) {
            throw new Error("Merchant location not set - cannot calculate delivery fee");
        }

        // 2. Calculate Haversine distance
        const distanceKm = this.haversineDistance(
            merchant.latitude,
            merchant.longitude,
            deliveryLat,
            deliveryLng
        );

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
        const resolvedVertical = vertical ?? resolveOrderVertical(merchant.category);
        const fee = computeDeliveryFee({
            baseFee: rawBaseFee,
            perKmFee: rawPerKmFee,
            distanceKm,
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
