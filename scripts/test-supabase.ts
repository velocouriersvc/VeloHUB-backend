import { supabaseAdmin } from "../src/utils/supabase-client";

async function testSupabase() {
    const tableName = process.argv[2] || "profiles";
    
    console.log(`Fetching from ${tableName}...`);
    
    // Initial query
    let query = supabaseAdmin
        .from(tableName)
        .select("*", { count: "exact" })
        .range(0, 49);

    // Attempt to sort by created_at
    let { data, error, count } = await query.order("created_at", { ascending: false });
    
    console.log("INITIAL RESULT:");
    console.log("Error:", error);
    if (!error) {
        console.log(`Count: ${count}`);
    }

    if (error && (
        error.code === '42703' || 
        error.code === 'PGRST100' || 
        error.message.includes('created_at" does not exist') ||
        error.message.includes('created_at does not exist')
    )) {
        console.log(`Table ${tableName} missing 'created_at' column (Code: ${error.code}). Retrying with 'id' or no order.`);
        
        // Reset query
        const idQuery = supabaseAdmin
            .from(tableName)
            .select("*", { count: "exact" })
            .range(0, 49);
        
        const idResult = await idQuery.order("id", { ascending: false });
        
        console.log("ID RESULT:");
        console.log("Error:", idResult.error);
        if (idResult.error) {
            // Final fallback: no order
            const finalResult = await supabaseAdmin
                .from(tableName)
                .select("*", { count: "exact" })
                .range(0, 49);
            
            console.log("NO ORDER RESULT:");
            console.log("Error:", finalResult.error);
        }
    }
}

testSupabase().catch(console.error);
