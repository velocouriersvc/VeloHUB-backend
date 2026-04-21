import { Request, Response } from "express";
import { supabaseAdmin } from "../utils/supabase-client";
import { AuditLogController } from "./AuditLogController";
import { AuditRiskLevel } from "../models/audit-log";
import { AppDataSource } from "../db/data-source";

export class SupabaseController {
    /**
     * GET /api/v1/admin/supabase/tables
     * Lists available tables (Hardcoded for now as Supabase JS client doesn't 
     * natively list tables without a specific RPC).
     */
    listTables = async (req: Request, res: Response) => {
        try {
            // In a real scenario, you'd have an RPC like 'get_tables' in Supabase.
            // For now, we'll return the full list of tables based on the Supabase schema.
            const tables = [
                "profiles", "merchants", "drivers", "buyer_information", 
                "audit_logs", "categories", "deliveries", "emergency_contacts", 
                "emergency_notifications", "id_cards", "influencer_referral_code_stats", 
                "influencer_referral_codes", "lease_requests", "lease_vehicles", 
                "merchant_notifications", "notifications_queue", "order_issues", 
                "order_items", "order_status", "order_status_log", "orders", 
                "outbox_events", "payment_methods", "payout_requests", 
                "paystack_recipients", "paystack_transfers", "paystack_webhook_logs", 
                "phone_otps", "product_listings", "product_shares", "products", 
                "promotion_usages", "promotions", "push_notification_tokens", 
                "push_tokens", "recent_locations", "referral_code_stats", "referral_codes", 
                "referral_links", "referrals", "review_requests", "reviews", 
                "ride_bookings", "ride_driver_responses", "ride_request_notifications", 
                "ride_requests", "ride_search_attempts", "rides", "roles", 
                "saved_addresses", "seller_payout_requests", "seller_profiles", 
                "service_bookings", "service_subscriptions", "store_shares", 
                "support_chats", "support_messages", "system_config", 
                "transactions", "trip_driver_queue", "trip_payments", "trip_pricing_quotes", 
                "trip_quotes", "trips", "user_discounts", "user_role_events", 
                "user_roles", "user_success_events", "wallet_transactions", "wallets", 
                "withdrawals"
            ];
            
            return res.json({ tables });
        } catch (error: any) {
            console.error("Error listing Supabase tables:", error);
            return res.status(500).json({ message: "Internal server error", error: error.message });
        }
    };

    /**
     * GET /api/v1/admin/supabase/tables/:tableName
     * Fetches data from a specific Supabase table.
     */
    getTableData = async (req: Request, res: Response) => {
        try {
            const { tableName } = req.params;
            const { page = 1, limit = 50 } = req.query;
            
            const start = (Number(page) - 1) * Number(limit);
            const end = start + Number(limit) - 1;

            // Initial query
            let query = supabaseAdmin
                .from(tableName)
                .select("*", { count: "exact" })
                .range(start, end);

            // Attempt to sort by created_at
            let { data, error, count } = await query.order("created_at", { ascending: false });

            // If it fails, try sorting by id or just fetch without order
            if (error) {
                console.log(`Table ${tableName} fetch with 'created_at' failed (Code: ${error.code}, Msg: ${error.message}). Retrying with 'id' or no order.`);
                
                // Reset query
                const idQuery = supabaseAdmin
                    .from(tableName)
                    .select("*", { count: "exact" })
                    .range(start, end);
                
                const idResult = await idQuery.order("id", { ascending: false });
                
                if (idResult.error) {
                    // Final fallback: no order
                    const finalResult = await supabaseAdmin
                        .from(tableName)
                        .select("*", { count: "exact" })
                        .range(start, end);
                    
                    data = finalResult.data;
                    error = finalResult.error;
                    count = finalResult.count;
                } else {
                    data = idResult.data;
                    error = idResult.error;
                    count = idResult.count;
                }
            }

            if (error) {
                console.error(`Supabase error fetching ${tableName}:`, error);
                return res.status(400).json({ 
                    message: `Error fetching from ${tableName}`, 
                    error: error.message,
                    details: error 
                });
            }

            // Record audit log
            await AuditLogController.record({
                action: "View Supabase Table",
                entity_type: "supabase_table",
                entity_id: tableName,
                performed_by: (req as any).user?.email || (req as any).user?.phoneNumber || "Admin",
                details: `Viewed ${data?.length ?? 0} records from Supabase table: ${tableName}`,
                risk_level: AuditRiskLevel.LOW
            });

            return res.json({
                data,
                total: count,
                page: Number(page),
                limit: Number(limit)
            });
        } catch (error: any) {
            console.error("Error fetching table data:", error);
            return res.status(500).json({ message: "Internal server error", error: error.message });
        }
    };

    /**
     * GET /api/v1/admin/supabase/migrate/stream
     * Streams the real-time migration progress of copying data from Supabase to Local DB.
     */
    streamMigration = async (req: Request, res: Response) => {
        // Setup SSE Headers
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        
        // This is important for express + nginx/proxies to stream immediately
        res.flushHeaders();

        const sendEvent = (event: string, data: any) => {
            res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
        };

        const snakeToCamel = (str: string) => {
            return str.replace(/_([a-z])/g, (match, letter) => letter.toUpperCase());
        };

        const ENUM_MAP: any = {
            'standard': 'delivery',
            'express': 'delivery',
            'successful': 'paid',
            'assigned': 'accepted',
            'pending_payment': 'pending',
            'awaiting_confirmation': 'pending',
            'preparing_order': 'preparing',
            'confirmed': 'accepted',
            'paid': 'accepted',
            'other': 'cash',
            'paystack': 'card',
            'system': 'admin',
            'true': 'active',
            'false': 'inactive'
        };

        const TABLE_COLUMN_MAP: any = {
            'rides': { 'rider_id': 'customerId', 'assigned_driver_id': 'driverId' },
            'orders': { 'buyer_id': 'customerId', 'total_major': 'totalAmount', 'order_number': 'orderNumber' },
            'user_roles': { 'user_id': 'userId' },
            'wallets': { 'user_id': 'userId' },
            'push_tokens': { 'user_id': 'userId' },
            'referral_codes': { 'user_id': 'userId' },
            'referral_links': { 'referrer_id': 'referrerId' },
            'service_subscriptions': { 'user_id': 'userId', 'merchant_id': 'merchantId', 'buyer_id': 'userId' },
            'profiles': { 'is_active': 'status', 'full_name': 'fullName', 'avatar_url': 'profileImageUrl' },
            'merchants': { 'id': 'userId', 'business_name': 'businessName', 'business_address': 'address' },
            'drivers': { 'id': 'userId', 'account_status': 'status' },
            'buyer_information': { 'id': 'userId' },
            'products': { 'merchant_id': 'merchantId', 'stock_quantity': 'stockQuantity', 'is_available': 'isActive' },
            'service_bookings': { 'merchant_id': 'merchantId', 'buyer_id': 'customerId' }
        };

        const REDIRECT_MAP: any = {
            'profiles': 'users',
            'merchants': 'merchant_profiles',
            'drivers': 'driver_profiles',
            'buyer_information': 'buyer_profiles'
        };

        const extractPoint = (hex: string) => {
            if (!hex || typeof hex !== 'string' || hex.length < 50) return null;
            try {
                const buffer = Buffer.from(hex, 'hex');
                const lng = buffer.readDoubleLE(9);
                const lat = buffer.readDoubleLE(17);
                return { lat, lng };
            } catch (e) {
                return null;
            }
        };

        const mapRowToLocal = (tableName: string, row: any) => {
            const mapped: any = {};
            const colMap = TABLE_COLUMN_MAP[tableName] || {};

            for (const [key, value] of Object.entries(row)) {
                let localKey = colMap[key] || snakeToCamel(key);

                // GPS Extraction
                if (tableName === 'rides' && (key === 'pickup' || key === 'dropoff')) {
                    const coords = extractPoint(value as string);
                    if (coords) {
                        mapped[`${key}Lat`] = coords.lat;
                        mapped[`${key}Lng`] = coords.lng;
                        mapped[`${key}Address`] = row[`${key}_address`] || 'Unknown';
                    }
                    continue;
                }

                // Value Translation
                let mappedValue = value;
                if (typeof value === 'string' && ENUM_MAP[value.toLowerCase()]) {
                    mappedValue = ENUM_MAP[value.toLowerCase()];
                }

                // Wallet Transaction Type logic
                if (tableName === 'wallet_transactions' && key === 'type') {
                    const amount = parseFloat(row.amount || '0');
                    mappedValue = amount >= 0 ? 'credit' : 'debit';
                }

                mapped[localKey] = mappedValue;
            }

            // --- Post-Loop Fallbacks (Ensures defaults aren't overwritten by nulls) ---
            if (tableName === 'rides') {
                mapped.type = mapped.type || 'ride';
                mapped.distanceKm = mapped.distanceKm || 0;
                mapped.durationMin = mapped.durationMin || 0;
                mapped.baseFare = mapped.baseFare || 0;
                mapped.subtotal = mapped.subtotal || 0;
                mapped.finalFare = mapped.finalFare || 0;
            }

            if (tableName === 'orders') {
                if (!mapped.items || (Array.isArray(mapped.items) && mapped.items.length === 0)) {
                    mapped.items = row.pricing_snapshot?.items || [];
                }
                mapped.commission = mapped.commission || 0;
                mapped.merchantEarnings = mapped.merchantEarnings || row.total_major || 0;
                mapped.paymentMethod = mapped.paymentMethod || 'cash';
                // Fallback for merchantId if missing
                if (!mapped.merchantId) {
                    mapped.merchantId = 'eab4742e-180e-4aaf-bfac-b32f6db06f3e';
                }
            }

            if (tableName === 'wallet_transactions') {
                mapped.reference = mapped.reference || `MIG-TX-${row.id.slice(0,8)}-${Date.now()}`;
                mapped.description = mapped.description || 'Migrated transaction';
                mapped.balanceBefore = mapped.balanceBefore || 0;
                mapped.balanceAfter = mapped.balanceAfter || 0;
            }

            if (tableName === 'referral_links' && !mapped.referralCodeString) {
                mapped.referralCodeString = 'MIG-REF-' + row.id.slice(0, 8).toUpperCase();
            }

            // Special Case: Profile Redirection Logic (splitting profiles into users + user_profiles)
            if (tableName === 'profiles') {
                const userRow: any = {
                    id: row.id,
                    phoneNumber: row.phone_number,
                    email: row.email,
                    status: row.is_active ? 'active' : 'inactive',
                    activeRole: row.user_type,
                    country: (row.country && row.country.length > 2) ? row.country.slice(0, 2) : (row.country || 'GH')
                };
                
                const profileRow: any = {
                    userId: row.id,
                    fullName: row.full_name || row.email?.split('@')[0] || 'Valued User',
                    profileImageUrl: row.avatar_url
                };

                return { userRow, profileRow };
            }

            if (tableName === 'merchants') {
                mapped.status = 'approved';
                mapped.category = row.business_type || 'General';
                mapped.fullName = (row.profiles as any)?.full_name || row.business_name || 'Business Owner';
            }

            if (tableName === 'drivers') {
                mapped.status = (row.account_status === 'active' || row.account_status === 'approved') ? 'approved' : 'pending';
                mapped.fullName = (row.profiles as any)?.full_name || row.full_name || 'Velo Driver';
                mapped.vehicleType = row.vehicle_type || 'motorcycle';
                mapped.licenseNumber = row.license_number || 'PENDING-' + row.id.slice(0,4);
            }

            if (tableName === 'buyer_information') {
                mapped.fullName = (row.profiles as any)?.full_name || row.full_name || 'Velo Buyer';
            }

            if (tableName === 'products') {
                mapped.category = (row.categories as any)?.name || 'General';
                mapped.isActive = row.is_available ?? true;
                mapped.stockQuantity = row.stock_quantity ?? 0;
            }

            return mapped;
        };

        const tables = [
            "profiles", "merchants", "drivers", "buyer_information", 
            "audit_logs", "categories", "deliveries", "emergency_contacts", 
            "emergency_notifications", "id_cards", "influencer_referral_code_stats", 
            "influencer_referral_codes", "lease_requests", "lease_vehicles", 
            "merchant_notifications", "notifications_queue", "order_issues", 
            "order_items", "order_status", "order_status_log", "orders", 
            "outbox_events", "payment_methods", "payout_requests", 
            "paystack_recipients", "paystack_transfers", "paystack_webhook_logs", 
            "phone_otps", "product_listings", "product_shares", "products", 
            "promotion_usages", "promotions", "push_notification_tokens", 
            "push_tokens", "recent_locations", "referral_code_stats", "referral_codes", 
            "referral_links", "referrals", "review_requests", "reviews", 
            "ride_bookings", "ride_driver_responses", "ride_request_notifications", 
            "ride_requests", "ride_search_attempts", "rides", "roles", 
            "saved_addresses", "seller_payout_requests", "seller_profiles", 
            "service_bookings", "service_subscriptions", "store_shares", 
            "support_chats", "support_messages", "system_config", 
            "transactions", "trip_driver_queue", "trip_payments", "trip_pricing_quotes", 
            "trip_quotes", "trips", "user_discounts", "user_role_events", 
            "user_roles", "user_success_events", "wallet_transactions", "wallets", 
            "withdrawals"
        ];

        try {
            sendEvent('info', { message: 'Initializing database connection & bypassing local foreign constraints...' });
            
            if (!AppDataSource.isInitialized) {
                await AppDataSource.initialize();
            }

            // Disable FK checks so we can insert tables in any order without failing on related data bugs
            await AppDataSource.query(`SET session_replication_role = 'replica';`);

            const batchSize = 1000;
            let currentTableIndex = 0;

            for (const tableName of tables) {
                currentTableIndex++;

                // 1. Check if the table exists locally before pulling
                // Special case for profiles: it maps to users + user_profiles (both exist)
                const localTableName = REDIRECT_MAP[tableName] || tableName;
                
                const [{ exists }] = await AppDataSource.query(
                    `SELECT EXISTS (
                        SELECT FROM information_schema.tables 
                        WHERE table_schema = 'public' 
                        AND table_name = $1
                    );`, [localTableName]
                );

                if (!exists && tableName !== 'profiles') {
                    sendEvent('progress', { 
                        table: tableName, 
                        tableIndex: currentTableIndex, 
                        totalTables: tables.length,
                        message: `Table ${tableName} (mapped to ${localTableName}) doesn't exist locally — Skipping`,
                        rowsMigrated: 0
                    });
                    continue;
                }

                sendEvent('progress', { 
                    table: tableName, 
                    tableIndex: currentTableIndex, 
                    totalTables: tables.length,
                    message: `Migrating ${tableName}...`,
                    rowsMigrated: 0
                });

                let hasMore = true;
                let offset = 0;
                let totalInserted = 0;

                while (hasMore) {
                    let selectStr = '*';
                    if (tableName === 'drivers' || tableName === 'merchants' || tableName === 'buyer_information') {
                        selectStr = '*, profiles(full_name)';
                    } else if (tableName === 'products') {
                        selectStr = '*, categories(name)';
                    }

                    const { data, error } = await supabaseAdmin
                        .from(tableName)
                        .select(selectStr)
                        .range(offset, offset + batchSize - 1);

                    if (error) {
                        console.error(`Error fetching from Supabase table ${tableName}:`, error);
                        sendEvent('warning', { message: `Supabase fetch error for ${tableName}: ${error.message}` });
                        break;
                    }

                    if (!data || data.length === 0) {
                        hasMore = false;
                        break;
                    }

                    // 2. Map snake_case to camelCase
                    const rawMapped = data.map(row => mapRowToLocal(tableName, row));

                    // Helper for inserting batches with fallback
                    const executeInsert = async (targetTable: string, items: any[]) => {
                        // Filter out items that have NULL for critical foreign keys (userId, customerId, etc)
                        // but only for specific tables that require them
                        const cleanedItems = items.filter(item => {
                            const criticalKeys = ['userId', 'customerId', 'driverId', 'merchantId'];
                            for (const key of criticalKeys) {
                                if (Object.prototype.hasOwnProperty.call(item, key) && (item[key] === null || item[key] === undefined)) {
                                    sendEvent('warning', { message: `Skipping row in ${targetTable}: missing ${key}` });
                                    return false;
                                }
                            }
                            return true;
                        });

                        if (cleanedItems.length === 0) return 0;

                        try {
                            await AppDataSource.createQueryBuilder()
                                .insert()
                                .into(targetTable)
                                .values(cleanedItems)
                                .orIgnore()
                                .execute();
                            return cleanedItems.length;
                        } catch (batchError: any) {
                            console.log(`[Batch Fail in ${targetTable}] Falling back to row-by-row... ${batchError.message}`);
                            let rows = 0;
                            for (const item of cleanedItems) {
                                try {
                                    await AppDataSource.createQueryBuilder()
                                        .insert()
                                        .into(targetTable)
                                        .values(item)
                                        .orIgnore()
                                        .execute();
                                    rows++;
                                } catch (rowErr: any) {
                                    sendEvent('warning', { message: `Row skip in ${targetTable}: ${rowErr.message}` });
                                }
                            }
                            return rows;
                        }
                    };

                    if (tableName === 'profiles') {
                        // Identity Split: user core first, then profile metadata
                        const userRows = rawMapped.map(m => m.userRow);
                        const profileRows = rawMapped.map(m => m.profileRow);
                        
                        await executeInsert('users', userRows);
                        const inserted = await executeInsert('user_profiles', profileRows);
                        totalInserted += inserted;
                    } else {
                        const inserted = await executeInsert(localTableName, rawMapped);
                        totalInserted += inserted;
                    }

                    sendEvent('progress', { 
                        table: tableName, 
                        tableIndex: currentTableIndex, 
                        totalTables: tables.length,
                        message: `Fetching...`,
                        rowsMigrated: totalInserted
                    });

                    offset += batchSize;
                    if (data.length < batchSize) {
                        hasMore = false;
                    }
                }
            }

            sendEvent('info', { message: 'Re-enabling foreign key constraints...' });
            await AppDataSource.query(`SET session_replication_role = 'origin';`);

            // Record audit log
            await AuditLogController.record({
                action: "Run Supabase Migration",
                entity_type: "database",
                entity_id: "global",
                performed_by: (req as any).user?.email || (req as any).user?.phoneNumber || "Admin",
                details: `Ran live database migration handling ${tables.length} tables`,
                risk_level: AuditRiskLevel.HIGH
            });

            sendEvent('complete', { message: 'Migration entirely completed successfully!' });

        } catch (e: any) {
            console.error("Migration failed:", e);
            sendEvent('error', { message: e.message || 'Unknown critical error occurred during migration.' });
            
            // Attempt to repair foreign key rules safely
            try {
                await AppDataSource.query(`SET session_replication_role = 'origin';`);
            } catch (fkResetError) {
                // Ignore resetting errors
            }
        } finally {
            res.end(); // close stream
        }
    };
}
