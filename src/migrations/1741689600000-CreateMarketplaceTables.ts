import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateMarketplaceTables1741689600000 implements MigrationInterface {
    name = "CreateMarketplaceTables1741689600000";

    public async up(queryRunner: QueryRunner): Promise<void> {
        // ═══════════════════════════════════════════════════════
        // ENUMS
        // ═══════════════════════════════════════════════════════

        await queryRunner.query(`
            CREATE TYPE "product_category_enum" AS ENUM (
                'food', 'grocery', 'pharmacy', 'marketplace', 'rentals', 'services'
            )
        `);

        await queryRunner.query(`
            CREATE TYPE "rental_duration_enum" AS ENUM (
                'hourly', 'daily', 'weekly'
            )
        `);

        await queryRunner.query(`
            CREATE TYPE "order_status_enum_v2" AS ENUM (
                'pending', 'accepted', 'preparing', 'ready_for_pickup',
                'driver_assigned', 'picked_up', 'in_transit',
                'delivered', 'completed', 'cancelled', 'refunded'
            )
        `);

        await queryRunner.query(`
            CREATE TYPE "order_payment_method_enum" AS ENUM (
                'momo', 'card', 'cash', 'wallet'
            )
        `);

        await queryRunner.query(`
            CREATE TYPE "order_payment_status_enum" AS ENUM (
                'pending', 'paid', 'escrowed', 'settled', 'refunded'
            )
        `);

        await queryRunner.query(`
            CREATE TYPE "delivery_type_enum_v2" AS ENUM (
                'delivery', 'pickup'
            )
        `);

        await queryRunner.query(`
            CREATE TYPE "order_cancelled_by_enum" AS ENUM (
                'customer', 'merchant', 'driver', 'system', 'admin'
            )
        `);

        await queryRunner.query(`
            CREATE TYPE "promo_applicable_to_enum" AS ENUM (
                'rides', 'orders', 'both'
            )
        `);

        // ═══════════════════════════════════════════════════════
        // PRODUCTS
        // ═══════════════════════════════════════════════════════

        await queryRunner.query(`
            CREATE TABLE "products" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "merchantId" uuid NOT NULL,
                "name" varchar(255) NOT NULL,
                "description" text,
                "category" "product_category_enum" NOT NULL,
                "price" decimal(10,2) NOT NULL,
                "compareAtPrice" decimal(10,2),
                "stockQuantity" int NOT NULL DEFAULT 0,
                "isActive" boolean NOT NULL DEFAULT true,
                "images" text[] NOT NULL DEFAULT '{}',
                "tags" text[] NOT NULL DEFAULT '{}',
                "preparationTimeMin" int,
                "expirationDate" date,
                "dosageInfo" text,
                "prescriptionRequired" boolean NOT NULL DEFAULT false,
                "rentalDuration" "rental_duration_enum",
                "deposit" decimal(10,2),
                "serviceDurationMin" int,
                "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
                "deletedAt" TIMESTAMP,
                CONSTRAINT "PK_products" PRIMARY KEY ("id"),
                CONSTRAINT "FK_products_merchant" FOREIGN KEY ("merchantId") REFERENCES "users"("id") ON DELETE CASCADE
            )
        `);

        await queryRunner.query(`CREATE INDEX "IDX_products_merchantId" ON "products" ("merchantId")`);
        await queryRunner.query(`CREATE INDEX "IDX_products_category" ON "products" ("category")`);

        // ═══════════════════════════════════════════════════════
        // PRODUCT CUSTOMIZATIONS
        // ═══════════════════════════════════════════════════════

        await queryRunner.query(`
            CREATE TABLE "product_customizations" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "productId" uuid NOT NULL,
                "title" varchar(255) NOT NULL,
                "isRequired" boolean NOT NULL DEFAULT false,
                "minSelections" int NOT NULL DEFAULT 0,
                "maxSelections" int NOT NULL DEFAULT 1,
                "sortOrder" int NOT NULL DEFAULT 0,
                "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_product_customizations" PRIMARY KEY ("id"),
                CONSTRAINT "FK_product_customizations_product" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE
            )
        `);

        // ═══════════════════════════════════════════════════════
        // CUSTOMIZATION OPTIONS
        // ═══════════════════════════════════════════════════════

        await queryRunner.query(`
            CREATE TABLE "customization_options" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "customizationId" uuid NOT NULL,
                "name" varchar(255) NOT NULL,
                "price" decimal(10,2) NOT NULL DEFAULT 0,
                "isDefault" boolean NOT NULL DEFAULT false,
                "sortOrder" int NOT NULL DEFAULT 0,
                CONSTRAINT "PK_customization_options" PRIMARY KEY ("id"),
                CONSTRAINT "FK_customization_options_customization" FOREIGN KEY ("customizationId") REFERENCES "product_customizations"("id") ON DELETE CASCADE
            )
        `);

        // ═══════════════════════════════════════════════════════
        // CARTS
        // ═══════════════════════════════════════════════════════

        await queryRunner.query(`
            CREATE TABLE "carts" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "userId" uuid NOT NULL,
                "merchantId" uuid,
                "subtotal" decimal(12,2) NOT NULL DEFAULT 0,
                "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "UQ_carts_userId" UNIQUE ("userId"),
                CONSTRAINT "PK_carts" PRIMARY KEY ("id"),
                CONSTRAINT "FK_carts_user" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE,
                CONSTRAINT "FK_carts_merchant" FOREIGN KEY ("merchantId") REFERENCES "users"("id")
            )
        `);

        await queryRunner.query(`CREATE INDEX "IDX_carts_userId" ON "carts" ("userId")`);

        // ═══════════════════════════════════════════════════════
        // CART ITEMS
        // ═══════════════════════════════════════════════════════

        await queryRunner.query(`
            CREATE TABLE "cart_items" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "cartId" uuid NOT NULL,
                "productId" uuid NOT NULL,
                "quantity" int NOT NULL DEFAULT 1,
                "unitPrice" decimal(10,2) NOT NULL,
                "selectedOptions" jsonb,
                "itemTotal" decimal(10,2) NOT NULL,
                "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_cart_items" PRIMARY KEY ("id"),
                CONSTRAINT "FK_cart_items_cart" FOREIGN KEY ("cartId") REFERENCES "carts"("id") ON DELETE CASCADE,
                CONSTRAINT "FK_cart_items_product" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE
            )
        `);

        // ═══════════════════════════════════════════════════════
        // ORDERS
        // ═══════════════════════════════════════════════════════

        await queryRunner.query(`
            CREATE TABLE "orders" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "orderNumber" varchar(20) NOT NULL,
                "customerId" uuid NOT NULL,
                "merchantId" uuid NOT NULL,
                "driverId" uuid,
                "items" jsonb NOT NULL,
                "subtotal" decimal(12,2) NOT NULL,
                "serviceFee" decimal(10,2) NOT NULL,
                "commission" decimal(10,2) NOT NULL,
                "deliveryFee" decimal(10,2) NOT NULL DEFAULT 0,
                "discountAmount" decimal(10,2) NOT NULL DEFAULT 0,
                "totalAmount" decimal(12,2) NOT NULL,
                "merchantEarnings" decimal(12,2) NOT NULL,
                "paymentMethod" "order_payment_method_enum" NOT NULL,
                "paymentStatus" "order_payment_status_enum" NOT NULL DEFAULT 'pending',
                "paymentReference" varchar(255),
                "deliveryType" "delivery_type_enum_v2" NOT NULL,
                "deliveryAddress" text,
                "deliveryLat" double precision,
                "deliveryLng" double precision,
                "pickupCode" varchar(6),
                "pickupCodeVerifiedAt" TIMESTAMP,
                "status" "order_status_enum_v2" NOT NULL DEFAULT 'pending',
                "cancelledBy" "order_cancelled_by_enum",
                "cancellationReason" text,
                "promoCodeId" uuid,
                "customerNote" text,
                "merchantNote" text,
                "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                "acceptedAt" TIMESTAMP,
                "preparingAt" TIMESTAMP,
                "readyAt" TIMESTAMP,
                "pickedUpAt" TIMESTAMP,
                "deliveredAt" TIMESTAMP,
                "completedAt" TIMESTAMP,
                "cancelledAt" TIMESTAMP,
                "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "UQ_orders_orderNumber" UNIQUE ("orderNumber"),
                CONSTRAINT "PK_orders" PRIMARY KEY ("id"),
                CONSTRAINT "FK_orders_customer" FOREIGN KEY ("customerId") REFERENCES "users"("id") ON DELETE CASCADE,
                CONSTRAINT "FK_orders_merchant" FOREIGN KEY ("merchantId") REFERENCES "users"("id"),
                CONSTRAINT "FK_orders_driver" FOREIGN KEY ("driverId") REFERENCES "users"("id"),
                CONSTRAINT "FK_orders_promo" FOREIGN KEY ("promoCodeId") REFERENCES "promo_codes"("id")
            )
        `);

        await queryRunner.query(`CREATE INDEX "IDX_orders_customerId" ON "orders" ("customerId")`);
        await queryRunner.query(`CREATE INDEX "IDX_orders_merchantId" ON "orders" ("merchantId")`);
        await queryRunner.query(`CREATE INDEX "IDX_orders_driverId" ON "orders" ("driverId")`);
        await queryRunner.query(`CREATE INDEX "IDX_orders_status" ON "orders" ("status")`);

        // ═══════════════════════════════════════════════════════
        // ORDER STATUS HISTORY
        // ═══════════════════════════════════════════════════════

        await queryRunner.query(`
            CREATE TABLE "order_status_history" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "orderId" uuid NOT NULL,
                "fromStatus" varchar(50),
                "toStatus" varchar(50) NOT NULL,
                "changedBy" uuid,
                "changedByRole" varchar(20) NOT NULL,
                "note" text,
                "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_order_status_history" PRIMARY KEY ("id"),
                CONSTRAINT "FK_order_status_history_order" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE,
                CONSTRAINT "FK_order_status_history_user" FOREIGN KEY ("changedBy") REFERENCES "users"("id")
            )
        `);

        // ═══════════════════════════════════════════════════════
        // ORDER RATINGS
        // ═══════════════════════════════════════════════════════

        await queryRunner.query(`
            CREATE TABLE "order_ratings" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "orderId" uuid NOT NULL,
                "customerId" uuid NOT NULL,
                "merchantId" uuid NOT NULL,
                "merchantRating" int NOT NULL,
                "merchantComment" text,
                "driverId" uuid,
                "driverRating" int,
                "driverComment" text,
                "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "UQ_order_ratings_orderId" UNIQUE ("orderId"),
                CONSTRAINT "PK_order_ratings" PRIMARY KEY ("id"),
                CONSTRAINT "FK_order_ratings_order" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE,
                CONSTRAINT "FK_order_ratings_customer" FOREIGN KEY ("customerId") REFERENCES "users"("id"),
                CONSTRAINT "FK_order_ratings_merchant" FOREIGN KEY ("merchantId") REFERENCES "users"("id"),
                CONSTRAINT "FK_order_ratings_driver" FOREIGN KEY ("driverId") REFERENCES "users"("id")
            )
        `);

        // ═══════════════════════════════════════════════════════
        // MERCHANT STATS
        // ═══════════════════════════════════════════════════════

        await queryRunner.query(`
            CREATE TABLE "merchant_stats" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "merchantId" uuid NOT NULL,
                "totalOrders" int NOT NULL DEFAULT 0,
                "totalRevenue" decimal(12,2) NOT NULL DEFAULT 0,
                "averageRating" decimal(3,2) NOT NULL DEFAULT 0,
                "ratingCount" int NOT NULL DEFAULT 0,
                "totalProducts" int NOT NULL DEFAULT 0,
                "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "UQ_merchant_stats_merchantId" UNIQUE ("merchantId"),
                CONSTRAINT "PK_merchant_stats" PRIMARY KEY ("id"),
                CONSTRAINT "FK_merchant_stats_merchant" FOREIGN KEY ("merchantId") REFERENCES "users"("id") ON DELETE CASCADE
            )
        `);

        // ═══════════════════════════════════════════════════════
        // PLATFORM SETTINGS
        // ═══════════════════════════════════════════════════════

        await queryRunner.query(`
            CREATE TABLE "platform_settings" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "country" varchar(3) NOT NULL,
                "currency" varchar(3) NOT NULL,
                "minimumOrderValue" decimal(10,2) NOT NULL,
                "defaultCommissionRate" decimal(5,2) NOT NULL DEFAULT 15.00,
                "defaultServiceFeeRate" decimal(5,2) NOT NULL DEFAULT 8.00,
                "defaultPickupFeeRate" decimal(5,2) NOT NULL DEFAULT 10.00,
                "deliveryBaseFee" decimal(10,2) NOT NULL,
                "deliveryPerKmFee" decimal(10,2) NOT NULL,
                "isActive" boolean NOT NULL DEFAULT true,
                "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "UQ_platform_settings_country" UNIQUE ("country"),
                CONSTRAINT "PK_platform_settings" PRIMARY KEY ("id")
            )
        `);

        // ═══════════════════════════════════════════════════════
        // MERCHANT OPERATING HOURS
        // ═══════════════════════════════════════════════════════

        await queryRunner.query(`
            CREATE TABLE "merchant_operating_hours" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "merchantId" uuid NOT NULL,
                "dayOfWeek" int NOT NULL,
                "openTime" TIME NOT NULL,
                "closeTime" TIME NOT NULL,
                "isClosed" boolean NOT NULL DEFAULT false,
                CONSTRAINT "PK_merchant_operating_hours" PRIMARY KEY ("id"),
                CONSTRAINT "UQ_merchant_operating_hours_day" UNIQUE ("merchantId", "dayOfWeek"),
                CONSTRAINT "FK_merchant_operating_hours_merchant" FOREIGN KEY ("merchantId") REFERENCES "users"("id") ON DELETE CASCADE
            )
        `);

        // ═══════════════════════════════════════════════════════
        // ALTER EXISTING TABLES
        // ═══════════════════════════════════════════════════════

        // -- MerchantProfile: add marketplace columns --
        await queryRunner.query(`ALTER TABLE "merchant_profiles" ADD COLUMN IF NOT EXISTS "description" text`);
        await queryRunner.query(`ALTER TABLE "merchant_profiles" ADD COLUMN IF NOT EXISTS "coverImageUrl" text`);
        await queryRunner.query(`ALTER TABLE "merchant_profiles" ADD COLUMN IF NOT EXISTS "isOpen" boolean NOT NULL DEFAULT false`);
        await queryRunner.query(`ALTER TABLE "merchant_profiles" ADD COLUMN IF NOT EXISTS "commissionRate" decimal(5,2)`);
        await queryRunner.query(`ALTER TABLE "merchant_profiles" ADD COLUMN IF NOT EXISTS "serviceFeeRate" decimal(5,2)`);
        await queryRunner.query(`ALTER TABLE "merchant_profiles" ADD COLUMN IF NOT EXISTS "pickupFeeRate" decimal(5,2)`);

        // -- PromoCode: add marketplace columns --
        await queryRunner.query(`ALTER TABLE "promo_codes" ADD COLUMN IF NOT EXISTS "applicableTo" "promo_applicable_to_enum" NOT NULL DEFAULT 'both'`);
        await queryRunner.query(`ALTER TABLE "promo_codes" ADD COLUMN IF NOT EXISTS "categoryRestriction" varchar(100)`);
        await queryRunner.query(`ALTER TABLE "promo_codes" ADD COLUMN IF NOT EXISTS "minOrderValue" decimal(10,2)`);
        await queryRunner.query(`ALTER TABLE "promo_codes" ADD COLUMN IF NOT EXISTS "merchantId" uuid`);
        await queryRunner.query(`
            ALTER TABLE "promo_codes"
            ADD CONSTRAINT "FK_promo_codes_merchant" FOREIGN KEY ("merchantId") REFERENCES "users"("id")
        `);

        // -- Notification: add new enum values --
        await queryRunner.query(`ALTER TYPE "notification_type_enum" ADD VALUE IF NOT EXISTS 'order_placed'`);
        await queryRunner.query(`ALTER TYPE "notification_type_enum" ADD VALUE IF NOT EXISTS 'order_accepted'`);
        await queryRunner.query(`ALTER TYPE "notification_type_enum" ADD VALUE IF NOT EXISTS 'order_rejected'`);
        await queryRunner.query(`ALTER TYPE "notification_type_enum" ADD VALUE IF NOT EXISTS 'order_preparing'`);
        await queryRunner.query(`ALTER TYPE "notification_type_enum" ADD VALUE IF NOT EXISTS 'order_ready'`);
        await queryRunner.query(`ALTER TYPE "notification_type_enum" ADD VALUE IF NOT EXISTS 'order_picked_up'`);
        await queryRunner.query(`ALTER TYPE "notification_type_enum" ADD VALUE IF NOT EXISTS 'order_in_transit'`);
        await queryRunner.query(`ALTER TYPE "notification_type_enum" ADD VALUE IF NOT EXISTS 'order_delivered'`);
        await queryRunner.query(`ALTER TYPE "notification_type_enum" ADD VALUE IF NOT EXISTS 'order_completed'`);
        await queryRunner.query(`ALTER TYPE "notification_type_enum" ADD VALUE IF NOT EXISTS 'order_cancelled'`);
        await queryRunner.query(`ALTER TYPE "notification_type_enum" ADD VALUE IF NOT EXISTS 'pickup_code_generated'`);
        await queryRunner.query(`ALTER TYPE "notification_type_enum" ADD VALUE IF NOT EXISTS 'pickup_code_verified'`);
        await queryRunner.query(`ALTER TYPE "notification_type_enum" ADD VALUE IF NOT EXISTS 'new_product_review'`);
        await queryRunner.query(`ALTER TYPE "notification_type_enum" ADD VALUE IF NOT EXISTS 'payout_requested'`);
        await queryRunner.query(`ALTER TYPE "notification_type_enum" ADD VALUE IF NOT EXISTS 'payout_completed'`);
        await queryRunner.query(`ALTER TYPE "notification_type_enum" ADD VALUE IF NOT EXISTS 'merchant_approved'`);
        await queryRunner.query(`ALTER TYPE "notification_type_enum" ADD VALUE IF NOT EXISTS 'merchant_suspended'`);

        // ═══════════════════════════════════════════════════════
        // SEED PLATFORM SETTINGS
        // ═══════════════════════════════════════════════════════

        await queryRunner.query(`
            INSERT INTO "platform_settings" ("country", "currency", "minimumOrderValue", "defaultCommissionRate", "defaultServiceFeeRate", "defaultPickupFeeRate", "deliveryBaseFee", "deliveryPerKmFee")
            VALUES
                ('GH', 'GHS', 50.00,   15.00, 8.00, 10.00, 5.00,   2.00),
                ('NG', 'NGN', 5000.00,  15.00, 8.00, 10.00, 500.00, 150.00),
                ('US', 'USD', 25.00,    15.00, 8.00, 10.00, 3.00,   1.50),
                ('CA', 'CAD', 25.00,    15.00, 8.00, 10.00, 3.50,   1.50),
                ('IN', 'INR', 500.00,   15.00, 8.00, 10.00, 30.00,  10.00)
            ON CONFLICT ("country") DO NOTHING
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // ── Drop FK on promo_codes ──
        await queryRunner.query(`ALTER TABLE "promo_codes" DROP CONSTRAINT IF EXISTS "FK_promo_codes_merchant"`);

        // ── Drop new columns from existing tables ──
        await queryRunner.query(`ALTER TABLE "promo_codes" DROP COLUMN IF EXISTS "merchantId"`);
        await queryRunner.query(`ALTER TABLE "promo_codes" DROP COLUMN IF EXISTS "minOrderValue"`);
        await queryRunner.query(`ALTER TABLE "promo_codes" DROP COLUMN IF EXISTS "categoryRestriction"`);
        await queryRunner.query(`ALTER TABLE "promo_codes" DROP COLUMN IF EXISTS "applicableTo"`);

        await queryRunner.query(`ALTER TABLE "merchant_profiles" DROP COLUMN IF EXISTS "pickupFeeRate"`);
        await queryRunner.query(`ALTER TABLE "merchant_profiles" DROP COLUMN IF EXISTS "serviceFeeRate"`);
        await queryRunner.query(`ALTER TABLE "merchant_profiles" DROP COLUMN IF EXISTS "commissionRate"`);
        await queryRunner.query(`ALTER TABLE "merchant_profiles" DROP COLUMN IF EXISTS "isOpen"`);
        await queryRunner.query(`ALTER TABLE "merchant_profiles" DROP COLUMN IF EXISTS "coverImageUrl"`);
        await queryRunner.query(`ALTER TABLE "merchant_profiles" DROP COLUMN IF EXISTS "description"`);

        // ── Drop new tables (reverse order of creation) ──
        await queryRunner.query(`DROP TABLE IF EXISTS "merchant_operating_hours"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "platform_settings"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "merchant_stats"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "order_ratings"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "order_status_history"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "orders"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "cart_items"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "carts"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "customization_options"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "product_customizations"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "products"`);

        // ── Drop new enums ──
        await queryRunner.query(`DROP TYPE IF EXISTS "promo_applicable_to_enum"`);
        await queryRunner.query(`DROP TYPE IF EXISTS "order_cancelled_by_enum"`);
        await queryRunner.query(`DROP TYPE IF EXISTS "delivery_type_enum_v2"`);
        await queryRunner.query(`DROP TYPE IF EXISTS "order_payment_status_enum"`);
        await queryRunner.query(`DROP TYPE IF EXISTS "order_payment_method_enum"`);
        await queryRunner.query(`DROP TYPE IF EXISTS "order_status_enum_v2"`);
        await queryRunner.query(`DROP TYPE IF EXISTS "rental_duration_enum"`);
        await queryRunner.query(`DROP TYPE IF EXISTS "product_category_enum"`);

        // NOTE: Cannot remove individual values from PostgreSQL enums.
        // The notification_type_enum additions are left in place (safe — unused values don't cause issues).
    }
}
