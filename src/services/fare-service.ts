import { AppDataSource } from "../db/data-source";
import { VehiclePricing, VehicleType } from "../models/vehicle-pricing";
import { PlatformSettings } from "../models/platform-settings";
import { SurgeRule, DayType } from "../models/surge-rule";
import { PromoCode } from "../models/promo-code";
import { createServiceLogger } from "../utils/logger";

const log = createServiceLogger("FareService");

/** Currency map by country code */
const CURRENCY_MAP: Record<string, string> = {
    GH: "GHS", NG: "NGN", US: "USD", CA: "CAD", IN: "INR", GB: "GBP",
};

/**
 * Country-specific display names for vehicle types.
 * The DB key stays as bike/car/suv/truck everywhere internally.
 * Only the label shown to the user changes by country.
 */
const VEHICLE_DISPLAY_NAMES: Record<string, Record<string, string>> = {
    US: {
        bike:  "Velo Go",      // No bikes in US — we call this tier "Velo Go"
        car:   "Velo Comfort", // Standard sedan
        suv:   "Velo XL",      // SUV / larger vehicle
        truck: "Velo Cargo",   // Truck / heavy load
    },
    CA: {
        bike:  "Velo Go",
        car:   "Velo Comfort",
        suv:   "Velo XL",
        truck: "Velo Cargo",
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
    platformCommission: number; // 15% × (base + distance + time) after surge
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

    /**
     * Calculate full fare breakdown for a ride.
     *
     * Formula (CLIENT UPDATED April 22, 2026):
     *   Trip Fare = (Base + (Per Km × Dist) + (Per Min × Time)) × Surge
     *   Gross Total = Trip Fare + Service Fee
     *   Final Rider Price = MAX(Gross Total, Minimum Fare)
     *   
     *   VeloHUB Share = Service Fee + (15% × Trip Fare)
     *   Driver Share = 85% × Trip Fare
     * 
     * NOTE: Service fee is now vehicle-specific (not country-wide)
     * NOTE: VeloHUB gets 100% of service fee + 15% commission
     */
    async calculateFare(
        vehicleType: VehicleType,
        distanceKm: number,
        durationMin: number,
        promoCode?: string,
        country: string = "GH"
    ): Promise<FareBreakdown> {
        // 1. Get vehicle pricing for this country
        const pricing = await this.pricingRepo.findOne({
            where: { vehicleType, country, isActive: true },
        });
        if (!pricing) {
            throw new Error(`No pricing found for vehicle type: ${vehicleType} in country: ${country}`);
        }

        // 2. Get platform settings for surge and other settings
        const settings = await this.settingsRepo.findOne({
            where: { country, isActive: true },
        });
        const commissionRate = settings ? Number(settings.rideCommissionRate) / 100 : 0.15;
        const maxSurge = settings ? Number(settings.maxSurgeMultiplier) : 2.50;
        const currency = settings?.currency || CURRENCY_MAP[country] || "USD";

        // 3. Calculate fare components (BEFORE surge)
        const baseFare = Number(pricing.basePrice);
        const distanceCost = Number(pricing.pricePerKm) * distanceKm;
        const timeCost = Number(pricing.pricePerMin) * durationMin;
        const fareSubtotal = baseFare + distanceCost + timeCost;

        // 4. Apply surge to trip fare portion only (NOT to service fee)
        const rawSurge = await this.getSurgeMultiplier(country);
        const surgeMultiplier = Math.min(rawSurge, maxSurge);
        const surgeAmount = surgeMultiplier > 1 ? fareSubtotal * (surgeMultiplier - 1) : 0;
        const tripFareAfterSurge = fareSubtotal * surgeMultiplier;

        // 5. Get vehicle-specific service fee (NEW: from vehicle_pricing table)
        const riderServiceFee = Number(pricing.riderServiceFee || 0);

        // 6. Calculate gross total BEFORE enforcing minimum
        const grossTotalBeforeMin = tripFareAfterSurge + riderServiceFee;

        // 7. Enforce minimum fare on the TOTAL (trip fare + service fee)
        const minimumFare = Number(pricing.minimumFare);
        const grossTotal = Math.max(grossTotalBeforeMin, minimumFare);
        
        // If minimum was applied, adjust the trip fare portion
        const adjustedTripFare = grossTotal > grossTotalBeforeMin 
            ? grossTotal - riderServiceFee 
            : tripFareAfterSurge;

        // 8. Commission split (CLIENT SPEC: VeloHUB gets service fee + 15% of trip fare)
        const platformCommission = Math.round((riderServiceFee + (adjustedTripFare * commissionRate)) * 100) / 100;
        const driverPayout = Math.round(adjustedTripFare * (1 - commissionRate) * 100) / 100;

        // 9. Apply promo code discount (applied to the gross total)
        let discountPercent = 0;
        let discountAmount = 0;
        const riderTotalBeforeDiscount = grossTotal;

        if (promoCode) {
            const promo = await this.validatePromoCode(promoCode);
            if (promo) {
                if (promo.discountType === "fixed") {
                    discountAmount = Number(promo.discountValue);
                    discountPercent = (discountAmount / riderTotalBeforeDiscount) * 100;
                } else {
                    discountPercent = Number(promo.discountValue || promo.discountPercent);
                    discountAmount = riderTotalBeforeDiscount * (discountPercent / 100);
                }
                if (promo.maxDiscountAmt && discountAmount > Number(promo.maxDiscountAmt)) {
                    discountAmount = Number(promo.maxDiscountAmt);
                }
            }
        }

        const finalFare = Math.max(
            Math.round((riderTotalBeforeDiscount - discountAmount) * 100) / 100,
            0
        );

        return {
            baseFare: Math.round(baseFare * 100) / 100,
            distanceCost: Math.round(distanceCost * 100) / 100,
            timeCost: Math.round(timeCost * 100) / 100,
            subtotal: Math.round(fareSubtotal * 100) / 100,
            riderServiceFee: Math.round(riderServiceFee * 100) / 100,
            surgeMultiplier,
            surgeAmount: Math.round(surgeAmount * 100) / 100,
            discountPercent,
            discountAmount: Math.round(discountAmount * 100) / 100,
            finalFare,
            driverPayout,
            platformCommission,
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
