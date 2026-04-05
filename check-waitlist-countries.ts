import { AppDataSource } from "./src/db/data-source";
import { WaitlistCountry } from "./src/models/waitlist-country";

async function check() {
    await AppDataSource.initialize();
    const repo = AppDataSource.getRepository(WaitlistCountry);
    const countries = await repo.find();
    console.log("Countries in DB:", JSON.stringify(countries, null, 2));
    await AppDataSource.destroy();
}

check().catch(console.error);
