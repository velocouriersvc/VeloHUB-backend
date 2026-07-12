import { AppDataSource } from "../db/data-source";
import { VehiclePricing, VehicleType } from "../models/vehicle-pricing";
import { PlatformSettings } from "../models/platform-settings";
import { SurgeRule, DayType } from "../models/surge-rule";
import { PromoCode } from "../models/promo-code";
import { Zone } from "../models/zone";
import { createServiceLogger } from "../utils/logger";
import { currencyForCountry } from "../utils/currency";
import {
    PricingVertical,
    SERVICE_FEE_RATE,
    PLATFORM_COMMISSION_RATE,
    MAX_SURGE_MULTIPLIER,
    computeRideFare,
    round2,
} from "../config/pricing";

const log = createServiceLogger("FareService");

/**
 * Country-specific display names for vehicle types.
 * The DB key stays as bike/car/suv/truck everywhere internally.
 * Only the label shown to the user changes by country.
 */
const VEHICLE_DISPLAY_NAMES: Record<string, Record<string, string>> = {
    US: {
        bike:  "Velo Go",       // Entry-level, no physical bikes
        car:   "Velo Standard", // Standard sedan
        suv:   "Velo Premium",  // SUV tier (aligned with the global "Velo Premium" name)
        truck: "Velo Truck",    // Truck / heavy load
    },
    CA: {
        bike:  "Velo Go",
        car:   "Velo Standard",
        suv:   "Velo Premium",
        truck: "Velo Truck",
    },
    // Ghana & Nigeria keep the original brand names
    GH: {
        bike:  "Velo Bikes",
        car:   "Velo Basic",
        suv:   "Velo Premium",
        truck: "Velo Trucks",
    },
    NG: {
        bike:  "Velo Bikes",
        car:   "Velo Basic",
        suv:   "Velo Premium",
        truck: "Velo Trucks",
    },
};

/** Returns the display name for a vehicle type in a given country */
function getVehicleDisplayName(vehicleType: string, country: string): string {
    return VEHICLE_DISPLAY_NAMES[country]?.[vehicleType]
        ?? VEHICLE_DISPLAY_NAMES["GH"]?.[vehicleType]
        ?? vehicleType;
}

export interface FareBreakdown {
    baseFare: number;
    distanceCost: number;
    timeCost: number;
    subtotal: number;
    riderServiceFee: number;
    surgeMultiplier: number;
    surgeAmount: number;
    discountPercent: number;
    discountAmount: number;
    finalFare: number;          // what the rider pays (subtotal after surge + service fee - discount)
    driverPayout: number;       // 85% × (base + distance + time) after surge
    rideCommission: number;     // 15% commission portion only (excludes service fee)
    platformCommission: number; // total platform share = service fee + 15% commission
    currency: string;
    vehicleType: VehicleType;
    displayName: string;        // Country-specific label shown to the user
    distanceKm: number;
    durationMin: number;
}

export class FareService {
    private pricingRepo = AppDataSource.getRepository(VehiclePricing);
    private settingsRepo = AppDataSource.getRepository(PlatformSettings);
    private surgeRepo = AppDataSource.getRepository(SurgeRule);
    private promoRepo = AppDataSource.getRepository(PromoCode);
    private zoneRepo = AppDataSource.getRepository(Zone);

    /**
     * Calculate full fare breakdown for a ride or delivery.
     *
     * Formula (Dynamic Fare Architecture):
     *   Subtotal      = (Base + (PerKm x Dist) + (PerMin x Time)) x VerticalWeights
     *   Surged        = Subtotal x Surge            (Surge capped at maxSurgeMultiplier)
     *   Service Fee   = Surged x 5%                 (100% to platform; fixed even at peak)
     *   Rider Pays    = Surged x 1.05               (then floored at the minimum fare)
     *   Driver Gets   = Surged x 85%
     *   Platform Gets = Service Fee + (Surged x 15%)
     *
     * All math is delegated to the pure `computeRideFare` (src/config/pricing.ts)
     * so it is computed in exactly one place and unit-tested against the spec.
     */
    async calculateFare(
        vehicleType: VehicleType,
        distanceKm: number,
        durationMin: number,
        promoCode?: string,
        country: string = "GH",
        vertical: PricingVertical = PricingVertical.RIDES,
        zoneSurcharge: number = 0
    ): Promise<FareBreakdown> {
        // 1. Get vehicle pricing for this country; fall back to the US/USD baseline so a
        // country without its own row still gets a working fare (global operation).
        let pricing = await this.pricingRepo.findOne({
            where: { vehicleType, country, isActive: true },
        });
        if (!pricing) {
            pricing = await this.pricingRepo.findOne({
                where: { vehicleType, country: "US", isActive: true },
            });
        }
        if (!pricing) {
            throw new Error(`No pricing found for vehicle type: ${vehicleType}`);
        }

        // 2. Get platform settings for surge / fee / commission config; fall back to the
        // global DEFAULT (USD) row, then US, so unknown countries still resolve config.
        let settings = await this.settingsRepo.findOne({
            where: { country, isActive: true },
        });
        if (!settings) {
            settings = (await this.settingsRepo.findOne({ where: { country: "DEFAULT", isActive: true } }))
                || (await this.settingsRepo.findOne({ where: { country: "US", isActive: true } }));
        }
        const commissionRate = settings ? Number(settings.rideCommissionRate) / 100 : PLATFORM_COMMISSION_RATE;
        const serviceFeeRate = settings ? Number(settings.defaultServiceFeeRate) / 100 : SERVICE_FEE_RATE;
        const maxSurge = settings ? Number(settings.maxSurgeMultiplier) : MAX_SURGE_MULTIPLIER;
        const currency = settings?.currency || currencyForCountry(country);

        // 3. Resolve the current surge multiplier (capped inside computeRideFare)
        const rawSurge = await this.getSurgeMultiplier(country);

        // 4. Pure fare computation WITHOUT discount (we resolve promo against the
        //    rider total below, since percentage promos need the total first).
        const base = computeRideFare({
            basePrice: Number(pricing.basePrice),
            pricePerKm: Number(pricing.pricePerKm),
            pricePerMin: Number(pricing.pricePerMin),
            distanceKm,
            durationMin,
            minimumFare: Number(pricing.minimumFare),
            bookingFee: Number(pricing.bookingFee ?? 0),
            bookingFeePercent: Number(pricing.bookingFeePercent ?? 0),
            roadLevy: Number(pricing.roadLevy ?? 0),
            zoneSurcharge,
            surgeMultiplier: rawSurge,
            maxSurge,
            serviceFeeRate,
            commissionRate,
            vertical,
        });

        // 5. Apply promo code discount against the rider total
        let discountPercent = 0;
        let discountAmount = 0;
        if (promoCode) {
            const promo = await this.validatePromoCode(promoCode);
            if (promo) {
                if (promo.discountType === "fixed") {
                    discountAmount = Number(promo.discountValue);
                    discountPercent = base.riderTotal > 0 ? (discountAmount / base.riderTotal) * 100 : 0;
                } else {
                    discountPercent = Number(promo.discountValue || promo.discountPercent);
                    discountAmount = base.riderTotal * (discountPercent / 100);
                }
                if (promo.maxDiscountAmt && discountAmount > Number(promo.maxDiscountAmt)) {
                    discountAmount = Number(promo.maxDiscountAmt);
                }
            }
        }
        discountAmount = Math.min(round2(discountAmount), base.riderTotal);
        const finalFare = round2(Math.max(base.riderTotal - discountAmount, 0));

        return {
            baseFare: base.baseFare,
            distanceCost: base.distanceCost,
            timeCost: base.timeCost,
            subtotal: base.subtotal,
            riderServiceFee: base.serviceFee,
            surgeMultiplier: base.surgeMultiplier,
            surgeAmount: base.surgeAmount,
            discountPercent: round2(discountPercent),
            discountAmount,
            finalFare,
            driverPayout: base.driverPayout,
            rideCommission: base.commissionOnly,
            platformCommission: base.platformCommission,
            currency,
            vehicleType,
            displayName: getVehicleDisplayName(vehicleType, country),
            distanceKm,
            durationMin,
        };
    }

    /**
     * Get all vehicle pricing options for a country (for showing customer fare estimates)
     */
    async getVehiclePricing(country: string = "GH"): Promise<VehiclePricing[]> {
        return this.pricingRepo.find({
            where: { isActive: true, country },
            order: { basePrice: "ASC" },
        });
    }

    /**
     * Sum of flat geofence surcharges for zones containing the pickup or dropoff point
     * (e.g. airport dropoff fee, bridge levy). Zones are admin-managed (lat/lng/radius).
     */
    async getZoneSurcharge(
        country: string,
        points: Array<{ lat?: number | null; lng?: number | null } | null | undefined>
    ): Promise<number> {
        const zones = await this.zoneRepo.find({ where: { country, status: "active" } });
        if (zones.length === 0) return 0;

        const toRad = (d: number) => (d * Math.PI) / 180;
        const kmBetween = (aLat: number, aLng: number, bLat: number, bLng: number) => {
            const R = 6371;
            const dLat = toRad(bLat - aLat);
            const dLng = toRad(bLng - aLng);
            const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
            return 2 * R * Math.asin(Math.sqrt(s));
        };

        let total = 0;
        for (const zone of zones) {
            const surcharge = Number(zone.flatSurcharge || 0);
            if (surcharge <= 0 || zone.latitude == null || zone.longitude == null) continue;
            const hit = points.some((p) =>
                p?.lat != null && p?.lng != null &&
                kmBetween(Number(p.lat), Number(p.lng), Number(zone.latitude), Number(zone.longitude)) <= Number(zone.radius_km || 0)
            );
            if (hit) total += surcharge;
        }
        return total;
    }

    /**
     * Get current surge multiplier based on time, day and country
     */
    async getSurgeMultiplier(country: string = "GH"): Promise<number> {
        const now = new Date();
        const currentHour = now.getHours();
        const dayOfWeek = now.getDay(); // 0=Sunday, 6=Saturday
        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

        const rules = await this.surgeRepo.find({
            where: { isActive: true, country },
        });

        let highestMultiplier = 1.0;

        for (const rule of rules) {
            // Check day match
            const dayMatch =
                rule.dayType === DayType.ALL ||
                (rule.dayType === DayType.WEEKEND && isWeekend) ||
                (rule.dayType === DayType.WEEKDAY && !isWeekend);

            if (!dayMatch) continue;

            // Check hour match (handles overnight ranges like 22-06)
            let hourMatch: boolean;
            if (rule.startHour <= rule.endHour) {
                hourMatch = currentHour >= rule.startHour && currentHour < rule.endHour;
            } else {
                // Overnight range (e.g., 22 to 6)
                hourMatch = currentHour >= rule.startHour || currentHour < rule.endHour;
            }

            if (hourMatch) {
                const multiplier = Number(rule.multiplier);
                if (multiplier > highestMultiplier) {
                    highestMultiplier = multiplier;
                }
            }
        }

        // Raw multiplier – caller is responsible for capping via settings.maxSurgeMultiplier
        return highestMultiplier;
    }

    /**
     * Validate and return a promo code if it's usable
     */
    async validatePromoCode(code: string): Promise<PromoCode | null> {
        const promo = await this.promoRepo.findOne({
            where: { code: code.toUpperCase(), isActive: true },
        });

        if (!promo) return null;

        // Check expiry
        const now = new Date();
        if (promo.expiresAt && now > promo.expiresAt) return null;
        if (promo.expiryDate && now > promo.expiryDate) return null;

        // Check usage limit
        if (promo.usageLimit && (promo.currentUses >= promo.usageLimit || promo.usedCount >= promo.usageLimit)) return null;

        return promo;
    }

    /**
     * Increment promo code usage after a ride is confirmed
     */
    async usePromoCode(code: string): Promise<void> {
        await this.promoRepo
            .createQueryBuilder()
            .update(PromoCode)
            .set({ usedCount: () => '"usedCount" + 1' })
            .where("code = :code", { code: code.toUpperCase() })
            .execute();
    }
}
