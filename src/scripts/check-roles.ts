
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

async function checkRoles() {
    try {
        await client.connect();

        const res = await client.query("SELECT * FROM roles WHERE name = 'driver'");

        if (res.rows.length > 0) {
            console.log("✅ Role 'driver' exists.");
            console.log(res.rows[0]);
        } else {
            console.log("❌ Role 'driver' does NOT exist. Seeding it now...");
            await client.query("INSERT INTO roles (id, name, description) VALUES (gen_random_uuid(), 'driver', 'Standard driver role')");
            console.log("✅ Role 'driver' seeded.");
        }

    } catch (err: any) {
        console.error("Error checking roles:", err.message);
    } finally {
        await client.end();
    }
}

checkRoles();
