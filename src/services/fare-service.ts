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
     * Formula (from client spec):
     *   Rider Total = Base Fare + (Per Km × Distance) + (Per Min × Time) + Rider Service Fee
     *                 × Surge Multiplier (applied to fare portion, NOT service fee)
     *   Driver Payout = 85% × (Base + Distance + Time) × Surge + 100% Tip
     *   VeloHUB Commission = 15% × (Base + Distance + Time) × Surge
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

        // 2. Get platform settings for rider service fee & commission
        const settings = await this.settingsRepo.findOne({
            where: { country, isActive: true },
        });
        const riderServiceFee = settings ? Number(settings.riderServiceFee) : 1.99;
        const commissionRate = settings ? Number(settings.rideCommissionRate) / 100 : 0.15;
        const maxSurge = settings ? Number(settings.maxSurgeMultiplier) : 2.50;
        const currency = settings?.currency || CURRENCY_MAP[country] || "USD";

        // 3. Calculate fare components
        const baseFare = Number(pricing.basePrice);
        const distanceCost = Number(pricing.pricePerKm) * distanceKm;
        const timeCost = Number(pricing.pricePerMin) * durationMin;
        let fareSubtotal = baseFare + distanceCost + timeCost;

        // Enforce minimum fare
        const minimumFare = Number(pricing.minimumFare);
        if (fareSubtotal < minimumFare) {
            fareSubtotal = minimumFare;
        }

        // 4. Apply surge to fare portion only (NOT to rider service fee)
        const rawSurge = await this.getSurgeMultiplier(country);
        const surgeMultiplier = Math.min(rawSurge, maxSurge);
        const surgeAmount = surgeMultiplier > 1 ? fareSubtotal * (surgeMultiplier - 1) : 0;
        const fareAfterSurge = fareSubtotal * surgeMultiplier;

        // 5. Commission split (on the fare portion after surge)
        const platformCommission = Math.round(fareAfterSurge * commissionRate * 100) / 100;
        const driverPayout = Math.round(fareAfterSurge * (1 - commissionRate) * 100) / 100;

        // 6. Apply promo code discount (applied to the total rider pays)
        let discountPercent = 0;
        let discountAmount = 0;
        const riderTotalBeforeDiscount = fareAfterSurge + riderServiceFee;

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
