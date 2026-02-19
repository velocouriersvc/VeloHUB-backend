
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import path from "path";

// Load environment variables from .env file
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey) {
    console.error("Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required in .env file.");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
        autoRefreshToken: false,
        persistSession: false
    }
});

async function listUsers() {
    try {
        const { data: { users }, error } = await supabase.auth.admin.listUsers();

        if (error) {
            console.error("Error fetching users:", error.message);
            return;
        }

        console.log(`Found ${users.length} users:`);
        users.forEach((user) => {
            console.log(`- ID: ${user.id}`);
            console.log(`  Email: ${user.email}`);
            console.log(`  Phone: ${user.phone}`);
            console.log(`  Last Sign In: ${user.last_sign_in_at}`);
            console.log(`  Metadata:`, user.user_metadata);
            console.log("---------------------------------------------------");
        });

    } catch (err) {
        console.error("Unexpected error:", err);
    }
}

listUsers();
