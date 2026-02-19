
const { Client } = require('pg');
const dotenv = require('dotenv');

dotenv.config();

const client = new Client({
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '5432'),
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
});

async function run() {
    try {
        await client.connect();
        console.log('Connected to database.');

        // List of policies from error message
        const policies = [
            { table: 'business_types', name: 'Admin can delete business types' },
            { table: 'buyer_information', name: 'Admin can delete buyer info' },
            { table: 'categories', name: 'Admin can delete categories' },
            { table: 'drivers', name: 'Admin can delete driver info' },
            { table: 'emergency_contacts', name: 'Admin can delete emergency contacts' },
            { table: 'merchants', name: 'Admin can delete merchant info' },
            { table: 'products', name: 'Admin can delete products' },
            { table: 'ride_bookings', name: 'Admin can delete rides' },
            { table: 'business_types', name: 'Admin can insert business types' },
            { table: 'categories', name: 'Admin can insert categories' },
            { table: 'products', name: 'Admin can update any product' },
            { table: 'ride_bookings', name: 'Admin can update any ride' },
            { table: 'business_types', name: 'Admin can update business types' },
            { table: 'categories', name: 'Admin can update categories' },
            { table: 'drivers', name: 'Admin can update driver sensitive fields' },
            { table: 'merchants', name: 'Admin can update sensitive merchant fields' },
            { table: 'ride_bookings', name: 'Admin can view all rides' },
            { table: 'user_roles', name: 'User can read own roles' },
            { table: 'attachments', name: 'admin_full_access_attachments' },
            { table: 'deliveries', name: 'admin_full_access_deliveries' },
            { table: 'order_status_log', name: 'admin_full_access_logs' },
            { table: 'order_items', name: 'admin_full_access_order_items' },
            { table: 'order_status', name: 'admin_full_access_status' },
            { table: 'transactions', name: 'admin_full_access_transactions' },
            { table: 'promotions', name: 'promotions_insert_policy' },
            { table: 'promotions', name: 'promotions_update_policy' },
            { table: 'promotions', name: 'promotions_update_policy' },
            { table: 'order_status', name: 'system_insert_status' },
            // New policies blocking roles table update
            { table: 'orders', name: 'insert_all_orders' },
            { table: 'orders', name: 'select_all_orders' },
            { table: 'orders', name: 'update_all_orders' },
        ];

        for (const p of policies) {
            try {
                console.log(`Dropping policy "${p.name}" on table "${p.table}"...`);
                await client.query(`DROP POLICY IF EXISTS "${p.name}" ON "${p.table}";`);
            } catch (e) {
                console.warn(`Failed to drop policy ${p.name}: ${e.message}`);
            }
        }

        // Also try to drop the column with cascade just in case, though TypeORM should handle it after policies are gone
        console.log('Attempting to drop profile_id column with CASCADE...');
        try {
            await client.query('ALTER TABLE "user_roles" DROP COLUMN IF EXISTS "profile_id" CASCADE;');
            console.log('Successfully dropped profile_id column with CASCADE.');
        } catch (e) {
            console.error('Error dropping column:', e.message);
        }

        console.log('Finished dropping policies.');

    } catch (err) {
        console.error('Error connecting to database:', err);
    } finally {
        await client.end();
    }
}

run();
