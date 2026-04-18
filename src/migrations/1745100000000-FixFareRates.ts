import { MigrationInterface, QueryRunner } from "typeorm";

export class FixFareRates1745100000000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        // Correct US platform settings to match official fare spec:
        //   - maxSurgeMultiplier: 2.0x (spec says 1.0x – 2.0x max, not 2.5x)
        //   - driverDeliveryFeeShare: 85% (confirmed by formula examples)
        await queryRunner.query(`
            UPDATE "platform_settings"
            SET
                "maxSurgeMultiplier" = 2.00,
                "driverDeliveryFeeShare" = 85.00
            WHERE country = 'US'
        `);

        // Correct US CAR minimum fare to $6.00 (spec: "Minimum Fare - $6.00")
        await queryRunner.query(`
            UPDATE "vehicle_pricing"
            SET "minimumFare" = 6.00
            WHERE country = 'US' AND "vehicleType" = 'car'
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            UPDATE "platform_settings"
            SET "maxSurgeMultiplier" = 2.50, "driverDeliveryFeeShare" = 75.00
            WHERE country = 'US'
        `);
        await queryRunner.query(`
            UPDATE "vehicle_pricing"
            SET "minimumFare" = 5.00
            WHERE country = 'US' AND "vehicleType" = 'car'
        `);
    }
}
