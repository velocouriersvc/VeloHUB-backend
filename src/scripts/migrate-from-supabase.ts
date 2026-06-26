import { AppDataSource } from "../db/data-source";
import { supabaseAdmin } from "../utils/supabase-client";

const tablesToMigrate = [
    // This array should ideally be ordered to respect foreign keys, or we disable FK constraints beforehand
    "profiles", "merchants", "drivers", "orders", "wallets", "transactions", 
    // ... add the rest of the 80 tables here
];

const batchSize = 1000;

async function migrateData() {
    try {
        console.log("Initializing database connection...");
        await AppDataSource.initialize();
        
        // 1. Temporarily disable foreign key checks to allow importing in any order
        // Note: You must be a superuser or the table owner to do this, OR run it in a specific session
        console.log("Disabling foreign key constraints...");
        await AppDataSource.query(`SET session_replication_role = 'replica';`);

        for (const tableName of tablesToMigrate) {
            console.log(`\n--- Migrating table: ${tableName} ---`);
            let hasMore = true;
            let offset = 0;
            let totalInserted = 0;

            while (hasMore) {
                // Fetch from Supabase in batches
                const { data, error } = await supabaseAdmin
                    .from(tableName)
                    .select("*")
                    .range(offset, offset + batchSize - 1);

                if (error) {
                    console.error(`Error fetching from Supabase table ${tableName}:`, error);
                    break;
                }

                if (!data || data.length === 0) {
                    hasMore = false;
                    break;
                }

                // Insert into local DB
                try {
                    // For raw insertion if we don't have TypeORM entities for everything:
                    // Using query builder to insert raw rows safely
                    await AppDataSource.createQueryBuilder()
                        .insert()
                        .into(tableName)
                        .values(data)
                        // .orIgnore() // Optional: ignore duplicates if rerunning
                        .execute();
                    
                    totalInserted += data.length;
                    console.log(`Inserted ${data.length} rows into ${tableName}. Total: ${totalInserted}`);
                } catch (insertError) {
                    console.error(`Error inserting into local table ${tableName}:`, insertError);
                    break;
                }

                offset += batchSize;
                
                // If we got exactly the batch size, there might be more
                hasMore = data.length === batchSize;
            }
        }

        // 2. Re-enable foreign key constraints
        console.log("\nRe-enabling foreign key constraints...");
        await AppDataSource.query(`SET session_replication_role = 'origin';`);

        console.log("\nMigration completed successfully!");
    } catch (e) {
        console.error("Migration failed:", e);
    } finally {
        await AppDataSource.destroy();
    }
}

migrateData();
