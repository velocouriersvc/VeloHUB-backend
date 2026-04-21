
import { AppDataSource } from "./src/db/data-source";

async function checkCounts() {
    await AppDataSource.initialize();
    const tables = ["users", "user_profiles", "merchant_profiles", "driver_profiles", "buyer_profiles"];
    for (const t of tables) {
        const res = await AppDataSource.query(`SELECT COUNT(*) as cnt FROM ${t}`);
        console.log(`${t}: ${res[0].cnt}`);
    }
    process.exit(0);
}

checkCounts();
