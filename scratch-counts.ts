import { AppDataSource } from "./src/db/data-source";
import "dotenv/config";

async function checkCounts() {
  await AppDataSource.initialize();
  const tables = [
    "audit_logs", "orders", "products", "push_tokens", 
    "referral_codes", "referral_links", "rides", "roles", 
    "service_bookings", "service_subscriptions", "user_roles", 
    "wallet_transactions", "wallets"
  ];
  console.log("Local Data Counts:");
  for (const t of tables) {
    try {
        const res = await AppDataSource.query(`SELECT COUNT(*) as count FROM ${t}`);
        console.log(`${t}: ${res[0].count}`);
    } catch(e: any) {
        console.log(`${t}: Error - ${e.message}`);
    }
  }
  process.exit(0);
}
checkCounts();
