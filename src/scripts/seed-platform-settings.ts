import { AppDataSource } from "../db/data-source";
import { PlatformSettings } from "../models/platform-settings";

const SETTINGS = [
    {
        country: "GH",
        currency: "GHS",
        minimumOrderValue: 10.0,
        defaultCommissionRate: 15.0,
        defaultServiceFeeRate: 8.0,
        defaultPickupFeeRate: 10.0,
        deliveryBaseFee: 5.0,
        deliveryPerKmFee: 1.5,
    },
    {
        country: "NG",
        currency: "NGN",
        minimumOrderValue: 1500.0,
        defaultCommissionRate: 15.0,
        defaultServiceFeeRate: 8.0,
        defaultPickupFeeRate: 10.0,
        deliveryBaseFee: 500.0,
        deliveryPerKmFee: 150.0,
    },
    {
        country: "US",
        currency: "USD",
        minimumOrderValue: 5.0,
        defaultCommissionRate: 20.0,
        defaultServiceFeeRate: 10.0,
        defaultPickupFeeRate: 10.0,
        deliveryBaseFee: 3.0,
        deliveryPerKmFee: 1.0,
    },
    {
        country: "CA",
        currency: "CAD",
        minimumOrderValue: 7.0,
        defaultCommissionRate: 20.0,
        defaultServiceFeeRate: 10.0,
        defaultPickupFeeRate: 10.0,
        deliveryBaseFee: 4.0,
        deliveryPerKmFee: 1.25,
    },
    {
        country: "IN",
        currency: "INR",
        minimumOrderValue: 100.0,
        defaultCommissionRate: 12.0,
        defaultServiceFeeRate: 5.0,
        defaultPickupFeeRate: 8.0,
        deliveryBaseFee: 30.0,
        deliveryPerKmFee: 10.0,
    },
];

async function seedPlatformSettings() {
    await AppDataSource.initialize();
    console.log("Database initialized");

    const repo = AppDataSource.getRepository(PlatformSettings);

    for (const data of SETTINGS) {
        const exists = await repo.findOne({ where: { country: data.country } });
        if (exists) {
            console.log(`⏭  ${data.country} already exists — skipping`);
            continue;
        }

        const entry = repo.create(data);
        await repo.save(entry);
        console.log(`✅ Seeded ${data.country} (${data.currency})`);
    }

    console.log("\nDone — platform_settings seeded.");
    await AppDataSource.destroy();
}

seedPlatformSettings().catch(console.error);
