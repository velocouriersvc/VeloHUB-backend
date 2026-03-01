import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateRideTables1709290000000 implements MigrationInterface {
    name = "CreateRideTables1709290000000";

    public async up(queryRunner: QueryRunner): Promise<void> {
        // --- ENUMS ---
        await queryRunner.query(`CREATE TYPE "transaction_type_enum" AS ENUM ('credit', 'debit')`);
        await queryRunner.query(`CREATE TYPE "vehicle_type_enum" AS ENUM ('bike', 'car', 'suv', 'truck')`);
        await queryRunner.query(`CREATE TYPE "day_type_enum" AS ENUM ('weekday', 'weekend', 'all')`);
        await queryRunner.query(`CREATE TYPE "ride_type_enum" AS ENUM ('ride', 'delivery')`);
        await queryRunner.query(`CREATE TYPE "payment_method_enum" AS ENUM ('momo', 'cash', 'wallet')`);
        await queryRunner.query(`CREATE TYPE "payment_status_enum" AS ENUM ('pending', 'paid', 'failed', 'refunded')`);
        await queryRunner.query(`CREATE TYPE "ride_status_enum" AS ENUM ('searching', 'accepted', 'awaiting_payment', 'paid', 'driver_enroute', 'arrived', 'ongoing', 'completed', 'cancelled')`);
        await queryRunner.query(`CREATE TYPE "cancelled_by_enum" AS ENUM ('customer', 'driver', 'system')`);
        await queryRunner.query(`CREATE TYPE "payment_record_status_enum" AS ENUM ('pending', 'success', 'failed', 'refunded')`);
        await queryRunner.query(`CREATE TYPE "notification_type_enum" AS ENUM ('ride_requested', 'ride_accepted', 'ride_cancelled', 'driver_enroute', 'driver_arrived', 'ride_started', 'ride_completed', 'payment_received', 'payment_failed', 'wallet_credited', 'wallet_debited', 'commission_deducted', 'new_rating', 'role_approved', 'role_rejected', 'promo_code', 'system')`);
        await queryRunner.query(`CREATE TYPE "device_platform_enum" AS ENUM ('ios', 'android')`);

        // --- WALLETS ---
        await queryRunner.query(`
            CREATE TABLE "wallets" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "userId" uuid NOT NULL,
                "balance" decimal(12,2) NOT NULL DEFAULT 0,
                "currency" varchar(3) NOT NULL DEFAULT 'GHS',
                "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "UQ_wallets_userId" UNIQUE ("userId"),
                CONSTRAINT "PK_wallets" PRIMARY KEY ("id"),
                CONSTRAINT "FK_wallets_user" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE
            )
        `);

        // --- WALLET TRANSACTIONS ---
        await queryRunner.query(`
            CREATE TABLE "wallet_transactions" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "walletId" uuid NOT NULL,
                "type" "transaction_type_enum" NOT NULL,
                "amount" decimal(12,2) NOT NULL,
                "balanceBefore" decimal(12,2) NOT NULL,
                "balanceAfter" decimal(12,2) NOT NULL,
                "reference" varchar(100) NOT NULL,
                "description" text NOT NULL,
                "metadata" jsonb,
                "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "UQ_wallet_tx_ref" UNIQUE ("reference"),
                CONSTRAINT "PK_wallet_transactions" PRIMARY KEY ("id"),
                CONSTRAINT "FK_wallet_tx_wallet" FOREIGN KEY ("walletId") REFERENCES "wallets"("id") ON DELETE CASCADE
            )
        `);

        // --- SAVED LOCATIONS ---
        await queryRunner.query(`
            CREATE TABLE "saved_locations" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "userId" uuid NOT NULL,
                "label" varchar(100) NOT NULL,
                "address" text NOT NULL,
                "lat" double precision NOT NULL,
                "lng" double precision NOT NULL,
                "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_saved_locations" PRIMARY KEY ("id"),
                CONSTRAINT "FK_saved_locations_user" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE
            )
        `);

        // --- VEHICLE PRICING ---
        await queryRunner.query(`
            CREATE TABLE "vehicle_pricing" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "vehicleType" "vehicle_type_enum" NOT NULL,
                "basePriceCedis" decimal(8,2) NOT NULL,
                "pricePerKm" decimal(8,2) NOT NULL,
                "pricePerMin" decimal(8,2) NOT NULL,
                "minimumFare" decimal(8,2) NOT NULL,
                "maxPassengers" int NOT NULL,
                "isActive" boolean NOT NULL DEFAULT true,
                "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "UQ_vehicle_pricing_type" UNIQUE ("vehicleType"),
                CONSTRAINT "PK_vehicle_pricing" PRIMARY KEY ("id")
            )
        `);

        // --- SURGE RULES ---
        await queryRunner.query(`
            CREATE TABLE "surge_rules" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "name" varchar(100) NOT NULL,
                "dayType" "day_type_enum" NOT NULL,
                "startHour" int NOT NULL,
                "endHour" int NOT NULL,
                "multiplier" decimal(3,2) NOT NULL,
                "isActive" boolean NOT NULL DEFAULT true,
                CONSTRAINT "PK_surge_rules" PRIMARY KEY ("id")
            )
        `);

        // --- PROMO CODES ---
        await queryRunner.query(`
            CREATE TABLE "promo_codes" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "code" varchar(50) NOT NULL,
                "discountPercent" decimal(5,2) NOT NULL,
                "maxDiscountAmt" decimal(8,2),
                "isActive" boolean NOT NULL DEFAULT true,
                "expiryDate" TIMESTAMP,
                "usageLimit" int,
                "usedCount" int NOT NULL DEFAULT 0,
                "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "UQ_promo_codes_code" UNIQUE ("code"),
                CONSTRAINT "PK_promo_codes" PRIMARY KEY ("id")
            )
        `);

        // --- RIDES ---
        await queryRunner.query(`
            CREATE TABLE "rides" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "customerId" uuid NOT NULL,
                "driverId" uuid,
                "type" "ride_type_enum" NOT NULL,
                "pickupAddress" text NOT NULL,
                "pickupLat" double precision NOT NULL,
                "pickupLng" double precision NOT NULL,
                "dropoffAddress" text NOT NULL,
                "dropoffLat" double precision NOT NULL,
                "dropoffLng" double precision NOT NULL,
                "vehicleType" "vehicle_type_enum" NOT NULL,
                "distanceKm" decimal(8,2) NOT NULL,
                "durationMin" decimal(8,2) NOT NULL,
                "baseFare" decimal(10,2) NOT NULL,
                "subtotal" decimal(10,2) NOT NULL,
                "surgeMultiplier" decimal(3,2) NOT NULL DEFAULT 1.00,
                "surgeAmount" decimal(10,2) NOT NULL DEFAULT 0,
                "discountPercent" decimal(5,2) NOT NULL DEFAULT 0,
                "discountAmount" decimal(10,2) NOT NULL DEFAULT 0,
                "finalFare" decimal(10,2) NOT NULL,
                "promoCodeId" uuid,
                "paymentMethod" "payment_method_enum",
                "paymentStatus" "payment_status_enum" NOT NULL DEFAULT 'pending',
                "status" "ride_status_enum" NOT NULL DEFAULT 'searching',
                "cancelledBy" "cancelled_by_enum",
                "cancelReason" text,
                "passengerCount" int NOT NULL DEFAULT 1,
                "searchRadiusKm" int NOT NULL DEFAULT 15,
                "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                "acceptedAt" TIMESTAMP,
                "paidAt" TIMESTAMP,
                "startedAt" TIMESTAMP,
                "completedAt" TIMESTAMP,
                "cancelledAt" TIMESTAMP,
                CONSTRAINT "PK_rides" PRIMARY KEY ("id"),
                CONSTRAINT "FK_rides_customer" FOREIGN KEY ("customerId") REFERENCES "users"("id") ON DELETE CASCADE,
                CONSTRAINT "FK_rides_driver" FOREIGN KEY ("driverId") REFERENCES "users"("id"),
                CONSTRAINT "FK_rides_promo" FOREIGN KEY ("promoCodeId") REFERENCES "promo_codes"("id")
            )
        `);

        // --- RIDE STOPS ---
        await queryRunner.query(`
            CREATE TABLE "ride_stops" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "rideId" uuid NOT NULL,
                "address" text NOT NULL,
                "lat" double precision NOT NULL,
                "lng" double precision NOT NULL,
                "stopOrder" int NOT NULL,
                "arrivedAt" TIMESTAMP,
                CONSTRAINT "PK_ride_stops" PRIMARY KEY ("id"),
                CONSTRAINT "FK_ride_stops_ride" FOREIGN KEY ("rideId") REFERENCES "rides"("id") ON DELETE CASCADE
            )
        `);

        // --- RIDE SHARED CONTACTS ---
        await queryRunner.query(`
            CREATE TABLE "ride_shared_contacts" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "rideId" uuid NOT NULL,
                "name" varchar(255) NOT NULL,
                "phone" varchar(20) NOT NULL,
                "notified" boolean NOT NULL DEFAULT false,
                CONSTRAINT "PK_ride_shared_contacts" PRIMARY KEY ("id"),
                CONSTRAINT "FK_ride_shared_contacts_ride" FOREIGN KEY ("rideId") REFERENCES "rides"("id") ON DELETE CASCADE
            )
        `);

        // --- PAYMENTS ---
        await queryRunner.query(`
            CREATE TABLE "payments" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "rideId" uuid,
                "orderId" uuid,
                "userId" uuid NOT NULL,
                "amount" decimal(10,2) NOT NULL,
                "currency" varchar(3) NOT NULL DEFAULT 'GHS',
                "method" "payment_method_enum" NOT NULL,
                "provider" varchar(50) NOT NULL DEFAULT 'paystack',
                "providerRef" varchar(255),
                "providerStatus" varchar(50),
                "platformFee" decimal(10,2) NOT NULL,
                "driverAmount" decimal(10,2) NOT NULL,
                "status" "payment_record_status_enum" NOT NULL DEFAULT 'pending',
                "metadata" jsonb,
                "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                "completedAt" TIMESTAMP,
                CONSTRAINT "PK_payments" PRIMARY KEY ("id"),
                CONSTRAINT "FK_payments_user" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE,
                CONSTRAINT "FK_payments_ride" FOREIGN KEY ("rideId") REFERENCES "rides"("id")
            )
        `);

        // --- RATINGS ---
        await queryRunner.query(`
            CREATE TABLE "ratings" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "rideId" uuid NOT NULL,
                "driverId" uuid NOT NULL,
                "customerId" uuid NOT NULL,
                "rating" int NOT NULL,
                "comment" text,
                "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "UQ_ratings_ride" UNIQUE ("rideId"),
                CONSTRAINT "PK_ratings" PRIMARY KEY ("id"),
                CONSTRAINT "FK_ratings_ride" FOREIGN KEY ("rideId") REFERENCES "rides"("id") ON DELETE CASCADE,
                CONSTRAINT "FK_ratings_driver" FOREIGN KEY ("driverId") REFERENCES "users"("id"),
                CONSTRAINT "FK_ratings_customer" FOREIGN KEY ("customerId") REFERENCES "users"("id")
            )
        `);

        // --- DRIVER STATS ---
        await queryRunner.query(`
            CREATE TABLE "driver_stats" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "driverId" uuid NOT NULL,
                "totalRides" int NOT NULL DEFAULT 0,
                "totalEarnings" decimal(12,2) NOT NULL DEFAULT 0,
                "averageRating" decimal(3,2) NOT NULL DEFAULT 0,
                "ratingCount" int NOT NULL DEFAULT 0,
                "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "UQ_driver_stats_driver" UNIQUE ("driverId"),
                CONSTRAINT "PK_driver_stats" PRIMARY KEY ("id"),
                CONSTRAINT "FK_driver_stats_driver" FOREIGN KEY ("driverId") REFERENCES "users"("id") ON DELETE CASCADE
            )
        `);

        // --- NOTIFICATIONS ---
        await queryRunner.query(`
            CREATE TABLE "notifications" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "userId" uuid NOT NULL,
                "type" "notification_type_enum" NOT NULL,
                "title" varchar(255) NOT NULL,
                "body" text NOT NULL,
                "data" jsonb,
                "isRead" boolean NOT NULL DEFAULT false,
                "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_notifications" PRIMARY KEY ("id"),
                CONSTRAINT "FK_notifications_user" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE
            )
        `);

        // --- PUSH TOKENS ---
        await queryRunner.query(`
            CREATE TABLE "push_tokens" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "userId" uuid NOT NULL,
                "token" text NOT NULL,
                "platform" "device_platform_enum" NOT NULL,
                "isActive" boolean NOT NULL DEFAULT true,
                "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_push_tokens" PRIMARY KEY ("id"),
                CONSTRAINT "FK_push_tokens_user" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE
            )
        `);

        // --- INDEXES ---
        await queryRunner.query(`CREATE INDEX "IDX_wallets_userId" ON "wallets" ("userId")`);
        await queryRunner.query(`CREATE INDEX "IDX_wallet_tx_walletId" ON "wallet_transactions" ("walletId")`);
        await queryRunner.query(`CREATE INDEX "IDX_wallet_tx_createdAt" ON "wallet_transactions" ("createdAt")`);
        await queryRunner.query(`CREATE INDEX "IDX_saved_locations_userId" ON "saved_locations" ("userId")`);
        await queryRunner.query(`CREATE INDEX "IDX_rides_customerId" ON "rides" ("customerId")`);
        await queryRunner.query(`CREATE INDEX "IDX_rides_driverId" ON "rides" ("driverId")`);
        await queryRunner.query(`CREATE INDEX "IDX_rides_status" ON "rides" ("status")`);
        await queryRunner.query(`CREATE INDEX "IDX_rides_createdAt" ON "rides" ("createdAt")`);
        await queryRunner.query(`CREATE INDEX "IDX_payments_rideId" ON "payments" ("rideId")`);
        await queryRunner.query(`CREATE INDEX "IDX_payments_userId" ON "payments" ("userId")`);
        await queryRunner.query(`CREATE INDEX "IDX_ratings_driverId" ON "ratings" ("driverId")`);
        await queryRunner.query(`CREATE INDEX "IDX_notifications_userId" ON "notifications" ("userId")`);
        await queryRunner.query(`CREATE INDEX "IDX_notifications_createdAt" ON "notifications" ("createdAt")`);
        await queryRunner.query(`CREATE INDEX "IDX_notifications_isRead" ON "notifications" ("isRead")`);
        await queryRunner.query(`CREATE INDEX "IDX_push_tokens_userId" ON "push_tokens" ("userId")`);

        // --- SEED VEHICLE PRICING ---
        await queryRunner.query(`
            INSERT INTO "vehicle_pricing" ("vehicleType", "basePriceCedis", "pricePerKm", "pricePerMin", "minimumFare", "maxPassengers") VALUES
            ('bike', 3.00, 1.80, 0.40, 5.00, 1),
            ('car', 6.00, 2.50, 0.60, 9.00, 4),
            ('suv', 10.00, 3.20, 0.80, 14.00, 6),
            ('truck', 18.00, 4.20, 1.00, 24.00, 2)
        `);

        // --- SEED SURGE RULES ---
        await queryRunner.query(`
            INSERT INTO "surge_rules" ("name", "dayType", "startHour", "endHour", "multiplier") VALUES
            ('Morning Rush', 'weekday', 7, 9, 1.30),
            ('Evening Rush', 'weekday', 17, 20, 1.50),
            ('Late Night', 'all', 23, 5, 1.40),
            ('Weekend', 'weekend', 0, 24, 1.20)
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Drop tables in reverse dependency order
        await queryRunner.query(`DROP TABLE IF EXISTS "push_tokens" CASCADE`);
        await queryRunner.query(`DROP TABLE IF EXISTS "notifications" CASCADE`);
        await queryRunner.query(`DROP TABLE IF EXISTS "driver_stats" CASCADE`);
        await queryRunner.query(`DROP TABLE IF EXISTS "ratings" CASCADE`);
        await queryRunner.query(`DROP TABLE IF EXISTS "payments" CASCADE`);
        await queryRunner.query(`DROP TABLE IF EXISTS "ride_shared_contacts" CASCADE`);
        await queryRunner.query(`DROP TABLE IF EXISTS "ride_stops" CASCADE`);
        await queryRunner.query(`DROP TABLE IF EXISTS "rides" CASCADE`);
        await queryRunner.query(`DROP TABLE IF EXISTS "promo_codes" CASCADE`);
        await queryRunner.query(`DROP TABLE IF EXISTS "surge_rules" CASCADE`);
        await queryRunner.query(`DROP TABLE IF EXISTS "vehicle_pricing" CASCADE`);
        await queryRunner.query(`DROP TABLE IF EXISTS "saved_locations" CASCADE`);
        await queryRunner.query(`DROP TABLE IF EXISTS "wallet_transactions" CASCADE`);
        await queryRunner.query(`DROP TABLE IF EXISTS "wallets" CASCADE`);

        // Drop enums
        await queryRunner.query(`DROP TYPE IF EXISTS "device_platform_enum"`);
        await queryRunner.query(`DROP TYPE IF EXISTS "notification_type_enum"`);
        await queryRunner.query(`DROP TYPE IF EXISTS "payment_record_status_enum"`);
        await queryRunner.query(`DROP TYPE IF EXISTS "cancelled_by_enum"`);
        await queryRunner.query(`DROP TYPE IF EXISTS "ride_status_enum"`);
        await queryRunner.query(`DROP TYPE IF EXISTS "payment_status_enum"`);
        await queryRunner.query(`DROP TYPE IF EXISTS "payment_method_enum"`);
        await queryRunner.query(`DROP TYPE IF EXISTS "ride_type_enum"`);
        await queryRunner.query(`DROP TYPE IF EXISTS "day_type_enum"`);
        await queryRunner.query(`DROP TYPE IF EXISTS "vehicle_type_enum"`);
        await queryRunner.query(`DROP TYPE IF EXISTS "transaction_type_enum"`);
    }
}
