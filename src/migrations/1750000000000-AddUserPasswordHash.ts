import { MigrationInterface, QueryRunner } from "typeorm";

// Adds the passwordHash column used by email + password authentication.
// Nullable so existing phone-OTP-only accounts are unaffected.
export class AddUserPasswordHash1750000000000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "passwordHash" text
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "users" DROP COLUMN IF EXISTS "passwordHash"
        `);
    }
}
