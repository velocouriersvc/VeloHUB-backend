
const { Client } = require("pg");
import dotenv from "dotenv";
import path from "path";
import { RoleType } from "../models/role";

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
        console.log("Connected to database for role check...");

        const rolesToEnsure = [
            { name: RoleType.BUYER, desc: 'Standard buyer/customer role' },
            { name: RoleType.DRIVER, desc: 'Delivery driver role' },
            { name: RoleType.MERCHANT, desc: 'Store merchant role' },
            { name: RoleType.ADMIN, desc: 'Platform administrator role' },
            { name: RoleType.SUPPORT_AGENT, desc: 'Customer support role' }
        ];

        for (const role of rolesToEnsure) {
            const res = await client.query("SELECT * FROM roles WHERE name = $1", [role.name]);

            if (res.rows.length > 0) {
                console.log(`✅ Role '${role.name}' exists.`);
            } else {
                console.log(`❌ Role '${role.name}' does NOT exist. Seeding it now...`);
                await client.query(
                    "INSERT INTO roles (id, name, description) VALUES (gen_random_uuid(), $1, $2)",
                    [role.name, role.desc]
                );
                console.log(`✅ Role '${role.name}' seeded.`);
            }
        }

    } catch (err: any) {
        console.error("Error checking roles:", err.message);
    } finally {
        await client.end();
    }
}

checkRoles();
