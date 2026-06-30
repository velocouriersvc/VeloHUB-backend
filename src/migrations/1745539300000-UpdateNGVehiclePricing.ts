import { MigrationInterface, QueryRunner } from "typeorm";

export class UpdateNGVehiclePricing1745539300000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            UPDATE vehicle_pricing SET
                "basePrice" = 1200, "pricePerKm" = 650, "pricePerMin" = 220,
                "minimumFare" = 5000, "riderServiceFee" = 400
            WHERE country = 'NG' AND "vehicleType" = 'bike'
        `);
        await queryRunner.query(`
            UPDATE vehicle_pricing SET
                "basePrice" = 2600, "pricePerKm" = 850, "pricePerMin" = 270,
                "minimumFare" = 6000, "riderServiceFee" = 400
            WHERE country = 'NG' AND "vehicleType" = 'car'
        `);
        await queryRunner.query(`
            UPDATE vehicle_pricing SET
                "basePrice" = 4200, "pricePerKm" = 1280, "pricePerMin" = 410,
                "minimumFare" = 11000, "riderServiceFee" = 400
            WHERE country = 'NG' AND "vehicleType" = 'suv'
        `);
        await queryRunner.query(`
            UPDATE vehicle_pricing SET
                "basePrice" = 6800, "pricePerKm" = 1750, "pricePerMin" = 560,
                "minimumFare" = 11500, "riderServiceFee" = 400
            WHERE country = 'NG' AND "vehicleType" = 'truck'
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {}
}
