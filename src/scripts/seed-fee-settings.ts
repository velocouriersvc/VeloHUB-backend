import { AppDataSource } from "../db/data-source";
import { PlatformSettings } from "../models/platform-settings";

async function seed() {
    try {
        if (!AppDataSource.isInitialized) {
            await AppDataSource.initialize();
        }

        const settingsRepo = AppDataSource.getRepository(PlatformSettings);
        const allSettings = await settingsRepo.find();

        console.log(`Found ${allSettings.length} platform settings records.`);

        for (const settings of allSettings) {
            console.log(`Updating settings for country: ${settings.country}`);

            // Nigeria has a client-specified ride commission rate of 15% — do not overwrite.
            if (settings.country !== "NG") {
                settings.rideCommissionRate = 20.00;
            }
            settings.deliveryTotalCommissionRate = 40.00;
            settings.deliveryRidePortionRate = 50.00; // 50% of 40 = 20%
            settings.deliveryServicePortionRate = 50.00; // 50% of 40 = 20%
            settings.serviceCommissionRate = 15.00;

            await settingsRepo.save(settings);
            console.log(`Successfully updated ${settings.country}`);
        }

        console.log("Seed completed successfully.");
        process.exit(0);
    } catch (error) {
        console.error("Error during seeding:", error);
        process.exit(1);
    }
}

seed();
