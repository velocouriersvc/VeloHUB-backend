import "dotenv/config";
import { AppDataSource } from "../db/data-source";
import { VehiclePricing } from "../models/vehicle-pricing";
import { PlatformSettings } from "../models/platform-settings";

/**
 * Test script to verify pricing data after seeds run.
 * 
 * Run: npx ts-node src/scripts/verify-pricing.ts
 */
async function verifyPricing() {
    await AppDataSource.initialize();
    console.log("✅ Database connected\n");

    const pricingRepo = AppDataSource.getRepository(VehiclePricing);
    const settingsRepo = AppDataSource.getRepository(PlatformSettings);

    // ===== GHANA VERIFICATION =====
    console.log("🇬🇭 GHANA (GHS) PRICING:");
    console.log("─".repeat(80));
    
    const ghPricing = await pricingRepo.find({
        where: { country: "GH", isActive: true },
        order: { vehicleType: "ASC" },
    });

    const ghSettings = await settingsRepo.findOne({
        where: { country: "GH", isActive: true },
    });

    console.log("Vehicle | Base   | Per Km | Per Min | Min Fare | Service Fee");
    console.log("───────────────────────────────────────────────────────────────");
    for (const p of ghPricing) {
        console.log(
            `${p.vehicleType.padEnd(7)} | ` +
            `${String(p.basePrice).padStart(6)} | ` +
            `${String(p.pricePerKm).padStart(6)} | ` +
            `${String(p.pricePerMin).padStart(7)} | ` +
            `${String(p.minimumFare).padStart(8)} | ` +
            `${ghSettings?.riderServiceFee || "N/A"}`
        );
    }

    // Expected values
    const expected = {
        bike: { base: 12, perKm: 6.8, perMin: 2.2, min: 50 },
        car: { base: 26, perKm: 8.5, perMin: 2.7, min: 60 },
        suv: { base: 42, perKm: 12.8, perMin: 4.1, min: 110 },
        truck: { base: 68, perKm: 17.5, perMin: 5.6, min: 115 },
    };

    console.log("\n✅ Verification:");
    let allCorrect = true;

    for (const p of ghPricing) {
        const exp = expected[p.vehicleType];
        const matches = 
            Number(p.basePrice) === exp.base &&
            Number(p.pricePerKm) === exp.perKm &&
            Number(p.pricePerMin) === exp.perMin &&
            Number(p.minimumFare) === exp.min;

        if (matches) {
            console.log(`   ✅ ${p.vehicleType.toUpperCase()}: Correct`);
        } else {
            console.log(`   ❌ ${p.vehicleType.toUpperCase()}: MISMATCH!`);
            console.log(`      Expected: base=${exp.base}, perKm=${exp.perKm}, perMin=${exp.perMin}, min=${exp.min}`);
            console.log(`      Got: base=${p.basePrice}, perKm=${p.pricePerKm}, perMin=${p.pricePerMin}, min=${p.minimumFare}`);
            allCorrect = false;
        }
    }

    if (ghSettings && Number(ghSettings.riderServiceFee) === 4.0) {
        console.log(`   ✅ RIDER SERVICE FEE: GH₵ 4.00 (correct)`);
    } else {
        console.log(`   ❌ RIDER SERVICE FEE: ${ghSettings?.riderServiceFee} (expected GH₵ 4.00)`);
        allCorrect = false;
    }

    // ===== USA VERIFICATION =====
    console.log("\n\n🇺🇸 USA (USD) PRICING:");
    console.log("─".repeat(80));
    
    const usPricing = await pricingRepo.find({
        where: { country: "US", isActive: true },
        order: { vehicleType: "ASC" },
    });

    const usSettings = await settingsRepo.findOne({
        where: { country: "US", isActive: true },
    });

    console.log("Vehicle | Base   | Per Km | Per Min | Min Fare | Service Fee");
    console.log("───────────────────────────────────────────────────────────────");
    for (const p of usPricing) {
        console.log(
            `${p.vehicleType.padEnd(7)} | ` +
            `${String(p.basePrice).padStart(6)} | ` +
            `${String(p.pricePerKm).padStart(6)} | ` +
            `${String(p.pricePerMin).padStart(7)} | ` +
            `${String(p.minimumFare).padStart(8)} | ` +
            `${usSettings?.riderServiceFee || "N/A"}`
        );
    }

    // ===== NIGERIA VERIFICATION =====
    console.log("\n\n🇳🇬 NIGERIA (NGN) PRICING:");
    console.log("─".repeat(80));
    
    const ngPricing = await pricingRepo.find({
        where: { country: "NG", isActive: true },
        order: { vehicleType: "ASC" },
    });

    const ngSettings = await settingsRepo.findOne({
        where: { country: "NG", isActive: true },
    });

    console.log("Vehicle | Base   | Per Km | Per Min | Min Fare | Service Fee");
    console.log("───────────────────────────────────────────────────────────────");
    for (const p of ngPricing) {
        console.log(
            `${p.vehicleType.padEnd(7)} | ` +
            `${String(p.basePrice).padStart(6)} | ` +
            `${String(p.pricePerKm).padStart(6)} | ` +
            `${String(p.pricePerMin).padStart(7)} | ` +
            `${String(p.minimumFare).padStart(8)} | ` +
            `${ngSettings?.riderServiceFee || "N/A"}`
        );
    }

    if (ngSettings && Number(ngSettings.riderServiceFee) === 400) {
        console.log(`\n   ✅ NIGERIA SERVICE FEE: ₦400 (correct)`);
    } else {
        console.log(`\n   ❌ NIGERIA SERVICE FEE: ${ngSettings?.riderServiceFee} (expected ₦400)`);
        allCorrect = false;
    }

    console.log("\n" + "═".repeat(80));
    if (allCorrect) {
        console.log("✅ ALL PRICING CORRECT! Seeds are working properly.");
    } else {
        console.log("❌ PRICING MISMATCH! Check seed scripts and re-run.");
    }
    console.log("═".repeat(80) + "\n");

    await AppDataSource.destroy();
    process.exit(allCorrect ? 0 : 1);
}

verifyPricing().catch((err) => {
    console.error("❌ Verification failed:", err);
    process.exit(1);
});
