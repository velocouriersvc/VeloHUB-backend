import { AppDataSource } from "../db/data-source";
import { VehiclePricing, VehicleType } from "../models/vehicle-pricing";
import { SurgeRule, DayType } from "../models/surge-rule";
import { PromoCode } from "../models/promo-code";
import { createServiceLogger } from "../utils/logger";

const log = createServiceLogger("FareService");

export interface FareBreakdown {
    baseFare: number;
    subtotal: number;
    surgeMultiplier: number;
    surgeAmount: number;
    discountPercent: number;
    discountAmount: number;
    finalFare: number;
    currency: string;
    vehicleType: VehicleType;
    distanceKm: number;
    durationMin: number;
}

const MAX_SURGE_MULTIPLIER = 2.5;

export class FareService {
    private pricingRepo = AppDataSource.getRepository(VehiclePricing);
    private surgeRepo = AppDataSource.getRepository(SurgeRule);
    private promoRepo = AppDataSource.getRepository(PromoCode);

    /**
     * Calculate full fare breakdown for a ride
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

        // 2. Calculate base subtotal
        const baseFare = Number(pricing.basePrice);
        const distanceCost = Number(pricing.pricePerKm) * distanceKm;
        const timeCost = Number(pricing.pricePerMin) * durationMin;
        let subtotal = baseFare + distanceCost + timeCost;

        // Enforce minimum fare
        const minimumFare = Number(pricing.minimumFare);
        if (subtotal < minimumFare) {
            subtotal = minimumFare;
        }

        // 3. Apply surge
        const surgeMultiplier = await this.getSurgeMultiplier(country);
        const surgeAmount = surgeMultiplier > 1 ? subtotal * (surgeMultiplier - 1) : 0;
        let afterSurge = subtotal + surgeAmount;

        // 4. Apply promo code discount
        let discountPercent = 0;
        let discountAmount = 0;

        if (promoCode) {
            const promo = await this.validatePromoCode(promoCode);
            if (promo) {
                if (promo.discountType === "fixed") {
                    discountAmount = Number(promo.discountValue);
                    discountPercent = (discountAmount / afterSurge) * 100;
                } else {
                    discountPercent = Number(promo.discountValue || promo.discountPercent);
                    discountAmount = afterSurge * (discountPercent / 100);
                }

                // Cap discount if maxDiscountAmt is set
                if (promo.maxDiscountAmt && discountAmount > Number(promo.maxDiscountAmt)) {
                    discountAmount = Number(promo.maxDiscountAmt);
                }
            }
        }

        const finalFare = Math.round((afterSurge - discountAmount) * 100) / 100;

        return {
            baseFare: Math.round(baseFare * 100) / 100,
            subtotal: Math.round(subtotal * 100) / 100,
            surgeMultiplier,
            surgeAmount: Math.round(surgeAmount * 100) / 100,
            discountPercent,
            discountAmount: Math.round(discountAmount * 100) / 100,
            finalFare: Math.max(finalFare, 0),
            currency: country === "GH" ? "GHS" : "GHS",
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

        // Cap at max surge
        return Math.min(highestMultiplier, MAX_SURGE_MULTIPLIER);
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
