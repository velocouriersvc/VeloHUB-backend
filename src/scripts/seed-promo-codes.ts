import { AppDataSource } from "../db/data-source";
import { PromoCode, PromoApplicableTo } from "../models/promo-code";

/**
 * Seed the customer-facing promo codes shown on the app Offers screen so that
 * one-tap "Apply" produces a REAL discount at checkout.
 *
 * Idempotent: rows are upserted by `code`, so running on every boot is safe and
 * keeps the values in sync with this file.
 *
 * Semantics:
 *  - VELOHUB50 : 50% off, Pharmacy orders only.
 *  - FREEDEL   : free delivery (waives the delivery fee), Restaurant orders, min order 50.
 *  - SMARTRIDE : fixed 10 off rides (seeded for realism; not surfaced for Apply yet).
 *
 * categoryRestriction is matched case-insensitively against merchant_profiles.category,
 * whose real values include "Pharmacy" and "Restaurant".
 */
const PROMOS: Partial<PromoCode>[] = [
    {
        code: "VELOHUB50",
        discountType: "percentage",
        discountValue: 50,
        categoryRestriction: "Pharmacy",
        applicableTo: PromoApplicableTo.ORDERS,
        isActive: true,
    },
    {
        code: "FREEDEL",
        discountType: "free_delivery",
        discountValue: 0,
        categoryRestriction: "Restaurant",
        minOrderValue: 50,
        applicableTo: PromoApplicableTo.ORDERS,
        isActive: true,
    },
    {
        code: "SMARTRIDE",
        discountType: "fixed",
        discountValue: 10,
        applicableTo: PromoApplicableTo.RIDES,
        isActive: true,
    },
];

export async function seedPromoCodes(alreadyInitialised = false) {
    if (!alreadyInitialised) {
        await AppDataSource.initialize();
    }

    const repo = AppDataSource.getRepository(PromoCode);

    let upserted = 0;
    for (const data of PROMOS) {
        const existing = await repo.findOne({ where: { code: data.code! } });
        if (existing) {
            Object.assign(existing, data);
            await repo.save(existing);
        } else {
            await repo.save(repo.create(data));
        }
        upserted++;
    }

    console.log(`✅ promo_codes: upserted ${upserted} rows`);

    if (!alreadyInitialised) {
        await AppDataSource.destroy();
    }
}

if (require.main === module) {
    seedPromoCodes(false)
        .then(() => console.log("Done - promo_codes seeded."))
        .catch(console.error);
}
