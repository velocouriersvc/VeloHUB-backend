
const { Client } = require("pg");
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const client = new Client({
    host: process.env.DB_HOST || '127.0.0.1',
    port: parseInt(process.env.DB_PORT || '54322'),
    user: process.env.DB_USERNAME || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    database: process.env.DB_NAME || 'postgres',
});

async function updateSchema() {
    try {
        await client.connect();

        console.log("Running: ALTER TABLE users ALTER COLUMN \"phoneNumber\" DROP NOT NULL");
        await client.query('ALTER TABLE users ALTER COLUMN "phoneNumber" DROP NOT NULL');

        console.log("✅ Schema updated successfully.");
    } catch (err: any) {
        console.error("❌ Error updating schema:", err.message);
    } finally {
        await client.end();
    }
}

updateSchema();
