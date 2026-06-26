import { MigrationInterface, QueryRunner } from "typeorm";

export class AddServiceToggles1745000000000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "platform_settings"
            ADD COLUMN IF NOT EXISTS "ridesEnabled" boolean NOT NULL DEFAULT true,
            ADD COLUMN IF NOT EXISTS "deliveryEnabled" boolean NOT NULL DEFAULT true
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "platform_settings"
            DROP COLUMN IF EXISTS "ridesEnabled",
            DROP COLUMN IF EXISTS "deliveryEnabled"
        `);
    }
}
