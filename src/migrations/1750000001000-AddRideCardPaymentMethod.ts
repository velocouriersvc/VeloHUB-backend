import { MigrationInterface, QueryRunner } from "typeorm";

// Adds 'card' to the ride paymentMethod enum so rides can be paid by card via Paystack.
// Only needed when DB_SYNCHRONIZE=false; with synchronize on, TypeORM applies it on boot.
export class AddRideCardPaymentMethod1750000001000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        // Postgres 12+ supports ADD VALUE IF NOT EXISTS inside a transaction.
        await queryRunner.query(`
            ALTER TYPE "rides_paymentmethod_enum" ADD VALUE IF NOT EXISTS 'card'
        `);
    }

    public async down(): Promise<void> {
        // Postgres does not support removing enum values; no-op.
    }
}
