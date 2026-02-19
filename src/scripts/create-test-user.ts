
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import path from "path";
const { Client } = require("pg");

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// DB Config
const dbConfig = {
    host: process.env.DB_HOST || '127.0.0.1',
    port: parseInt(process.env.DB_PORT || '54322'),
    user: process.env.DB_USERNAME || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    database: process.env.DB_NAME || 'postgres',
};

if (!supabaseUrl || !supabaseServiceRoleKey) {
    console.error("Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

async function createAndCheckUser() {
    const testEmail = `test_${Date.now()}@example.com`;
    const testPassword = "password123";
    const testPhone = `+1${Math.floor(1000000000 + Math.random() * 9000000000)}`;

    console.log(`1. Creating Supabase Auth User: ${testEmail} / ${testPhone}`);

    const { data: { user }, error } = await supabase.auth.admin.createUser({
        email: testEmail,
        password: testPassword,
        phone: testPhone,
        email_confirm: true,
        phone_confirm: true
    });

    if (error || !user) {
        console.error("Failed to create user:", error?.message);
        return;
    }

    console.log(`   Success! Auth User ID: ${user.id}`);

    // Wait a moment for any potential triggers to fire
    console.log("2. Waiting 2 seconds for triggers...");
    await new Promise(r => setTimeout(r, 2000));

    // Check Postgres
    console.log("3. Checking public.users table...");
    const pgClient = new Client(dbConfig);

    try {
        await pgClient.connect();
        const res = await pgClient.query('SELECT * FROM users WHERE id = $1', [user.id]);

        if (res.rows.length > 0) {
            console.log("   ✅ User FOUND in public.users table!");
            console.log("   Sync is working via Database Triggers.");
            console.log("   User Data:", res.rows[0]);
        } else {
            console.log("   ❌ User NOT FOUND in public.users table.");
            console.log("   Automatic sync is NOT enabled. You must call the /sync API endpoint manually.");
        }

    } catch (err: any) { // Type as basic any to avoid detailed PG error type issues in simple script
        console.error("   Database Error:", err.message);
    } finally {
        await pgClient.end();
    }
}

createAndCheckUser();
