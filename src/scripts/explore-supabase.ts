import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL || "";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("Missing Supabase credentials");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkTable(tableName: string) {
  console.log(`\n--- Checking table: ${tableName} ---`);
  
  // Try without order to see if it even exists
  const { data, error } = await supabase
    .from(tableName)
    .select("*")
    .limit(1);

  if (error) {
    console.error(`Error fetching ${tableName}:`, error.message);
    return;
  }

  if (data && data.length > 0) {
    console.log(`Table ${tableName} exists. Columns:`, Object.keys(data[0]));
    if (data[0].created_at) {
        console.log(`'created_at' exists.`);
    } else if (data[0].inserted_at) {
        console.log(`'inserted_at' exists instead.`);
    } else {
        console.log(`Neither 'created_at' nor 'inserted_at' found.`);
    }
  } else {
    console.log(`Table ${tableName} exists but is empty.`);
  }
}

async function explore() {
  const tablesToCheck = ["profiles", "orders", "users", "notifications", "rides"];
  for (const table of tablesToCheck) {
      await checkTable(table);
  }
}

explore();
