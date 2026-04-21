
import { supabaseAdmin } from "./src/utils/supabase-client";

async function listSupabaseTables() {
    // There is no direct "list tables" in Supabase JS SDK, 
    // but we can try to query the schema if permissions allow, 
    // or just check common names.
    // However, the best way for this specific task is to check 
    // the hardcoded list against what handles "services" in their old app.
    
    // Let's try to fetch a few samples from possible service tables.
    const possible = ["services", "service_providers", "vendor_services", "bookings"];
    for (const p of possible) {
        const { data, error } = await supabaseAdmin.from(p).select("*").limit(1);
        if (!error) {
            console.log(`Found table: ${p}`);
        } else {
            console.log(`Table ${p} not found or error: ${error.message}`);
        }
    }
}

listSupabaseTables();
