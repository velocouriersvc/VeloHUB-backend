import { MigrationInterface, QueryRunner } from "typeorm";

export class AddMultiCountrySupport1741776000000 implements MigrationInterface {
    name = "AddMultiCountrySupport1741776000000";

    public async up(queryRunner: QueryRunner): Promise<void> {
        // ── Users ──
        await queryRunner.query(`
            ALTER TABLE "users"
            ADD COLUMN IF NOT EXISTS "country" VARCHAR(2) NOT NULL DEFAULT 'GH'
        `);

        // ── Vehicle Pricing ──
        // Rename basePriceCedis → basePrice
        await queryRunner.query(`
            ALTER TABLE "vehicle_pricing"
            RENAME COLUMN "basePriceCedis" TO "basePrice"
        `);

        // Add country column
        await queryRunner.query(`
            ALTER TABLE "vehicle_pricing"
            ADD COLUMN IF NOT EXISTS "country" VARCHAR(2) NOT NULL DEFAULT 'GH'
        `);

        // Drop old unique constraint on vehicleType alone
        await queryRunner.query(`
            ALTER TABLE "vehicle_pricing"
            DROP CONSTRAINT IF EXISTS "UQ_vehicle_pricing_vehicleType"
        `);
        // TypeORM may have named it differently — try the auto-generated name too
        await queryRunner.query(`
            DROP INDEX IF EXISTS "UQ_vehicle_pricing_vehicleType"
        `);

        // Create composite unique on (vehicleType, country)
        await queryRunner.query(`
            ALTER TABLE "vehicle_pricing"
            ADD CONSTRAINT "UQ_vehicle_pricing_type_country" UNIQUE ("vehicleType", "country")
        `);

        // ── Surge Rules ──
        await queryRunner.query(`
            ALTER TABLE "surge_rules"
            ADD COLUMN IF NOT EXISTS "country" VARCHAR(2) NOT NULL DEFAULT 'GH'
        `);

        // ── Rides ──
        await queryRunner.query(`
            ALTER TABLE "rides"
            ADD COLUMN IF NOT EXISTS "currency" VARCHAR(3) NOT NULL DEFAULT 'GHS'
        `);

        // ── Orders ──
        await queryRunner.query(`
            ALTER TABLE "orders"
            ADD COLUMN IF NOT EXISTS "currency" VARCHAR(3) NOT NULL DEFAULT 'GHS'
        `);

        // ── Payments — add CARD to enum ──
        await queryRunner.query(`
            ALTER TYPE "payment_method_type_enum"
            ADD VALUE IF NOT EXISTS 'card'
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // ── Remove currency from orders ──
        await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN IF EXISTS "currency"`);

        // ── Remove currency from rides ──
        await queryRunner.query(`ALTER TABLE "rides" DROP COLUMN IF EXISTS "currency"`);

        // ── Remove country from surge_rules ──
        await queryRunner.query(`ALTER TABLE "surge_rules" DROP COLUMN IF EXISTS "country"`);

        // ── Vehicle Pricing — revert ──
        await queryRunner.query(`
            ALTER TABLE "vehicle_pricing"
            DROP CONSTRAINT IF EXISTS "UQ_vehicle_pricing_type_country"
        `);

        await queryRunner.query(`
            ALTER TABLE "vehicle_pricing"
            DROP COLUMN IF EXISTS "country"
        `);

        await queryRunner.query(`
            ALTER TABLE "vehicle_pricing"
            RENAME COLUMN "basePrice" TO "basePriceCedis"
        `);

        await queryRunner.query(`
            ALTER TABLE "vehicle_pricing"
            ADD CONSTRAINT "UQ_vehicle_pricing_vehicleType" UNIQUE ("vehicleType")
        `);

        // ── Remove country from users ──
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "country"`);

        // Note: PostgreSQL does not support removing values from enums.
        // CARD will remain in payment_method_type_enum after rollback.
    }
}
