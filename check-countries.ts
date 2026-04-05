import { AppDataSource } from "./src/db/data-source";
import { Waitlist } from "./src/models/waitlist";

async function check() {
    await AppDataSource.initialize();
    const repo = AppDataSource.getRepository(Waitlist);
    const waits = await repo.find();
    const countries = Array.from(new Set(waits.map(w => w.country))).filter(Boolean);
    console.log("Countries in DB:", JSON.stringify(countries, null, 2));
    await AppDataSource.destroy();
}

check().catch(console.error);
