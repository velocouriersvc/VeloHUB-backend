
const { Client } = require("pg");
import dotenv from "dotenv";
import path from "path";
import crypto from "crypto";

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const client = new Client({
    host: process.env.DB_HOST || '127.0.0.1',
    port: parseInt(process.env.DB_PORT || '54322'),
    user: process.env.DB_USERNAME || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    database: process.env.DB_NAME || 'postgres',
});

async function verifyConstraints() {
    try {
        await client.connect();

        const timestamp = Date.now();
        const id1 = crypto.randomUUID();
        const id2 = crypto.randomUUID();
        const id3 = crypto.randomUUID();
        const id4 = crypto.randomUUID();

        console.log("1. Insert User 1 with NULL phone...");
        await client.query('INSERT INTO users (id, "phoneNumber", status, "createdAt", "updatedAt") VALUES ($1, NULL, \'active\', NOW(), NOW())', [id1]);
        console.log("   ✅ Success");

        console.log("2. Insert User 2 with NULL phone (Checking multiple NULLs)...");
        await client.query('INSERT INTO users (id, "phoneNumber", status, "createdAt", "updatedAt") VALUES ($1, NULL, \'active\', NOW(), NOW())', [id2]);
        console.log("   ✅ Success (Multiple NULLs allowed)");

        console.log("3. Insert User 3 with Real phone...");
        const realPhone = `+1555${timestamp.toString().slice(-7)}`;
        await client.query('INSERT INTO users (id, "phoneNumber", status, "createdAt", "updatedAt") VALUES ($1, $2, \'active\', NOW(), NOW())', [id3, realPhone]);
        console.log(`   ✅ Success (${realPhone})`);

        console.log("4. Insert User 4 with SAME Real phone (Should fail)...");
        try {
            await client.query('INSERT INTO users (id, "phoneNumber", status, "createdAt", "updatedAt") VALUES ($1, $2, \'active\', NOW(), NOW())', [id4, realPhone]);
            console.error("   ❌ FAILED: Duplicate phone number was allowed!");
        } catch (err: any) {
            if (err.code === '23505') { // Unique violation
                console.log("   ✅ Success: Duplicate phone number REJECTED.");
            } else {
                console.error("   ❓ Unexpected error:", err.message);
            }
        }

        // Cleanup
        await client.query('DELETE FROM users WHERE id IN ($1, $2, $3)', [id1, id2, id3]);

    } catch (err: any) {
        console.error("❌ Unexpected Error:", err.message);
    } finally {
        await client.end();
    }
}

verifyConstraints();
