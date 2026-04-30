import { MigrationInterface, QueryRunner } from "typeorm";

// Reduces Nigeria fares to match Bolt/Uber market rates for Lagos.
// Previous rates produced fares 4-5x higher than competitors on typical routes.
// Target: ~₦5,100 bike | ~₦7,800 car | ~₦11,400 SUV for a 20km/40min trip.
export class UpdateNGVehiclePricingCompetitive1746009600000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            UPDATE vehicle_pricing SET
                "basePrice" = 500, "pricePerKm" = 130, "pricePerMin" = 40,
                "minimumFare" = 4500, "riderServiceFee" = 400
            WHERE country = 'NG' AND "vehicleType" = 'bike'
        `);
        await queryRunner.query(`
            UPDATE vehicle_pricing SET
                "basePrice" = 800, "pricePerKm" = 200, "pricePerMin" = 65,
                "minimumFare" = 6000, "riderServiceFee" = 400
            WHERE country = 'NG' AND "vehicleType" = 'car'
        `);
        await queryRunner.query(`
            UPDATE vehicle_pricing SET
                "basePrice" = 1200, "pricePerKm" = 300, "pricePerMin" = 95,
                "minimumFare" = 9000, "riderServiceFee" = 400
            WHERE country = 'NG' AND "vehicleType" = 'suv'
        `);
        await queryRunner.query(`
            UPDATE vehicle_pricing SET
                "basePrice" = 2000, "pricePerKm" = 450, "pricePerMin" = 140,
                "minimumFare" = 12000, "riderServiceFee" = 400
            WHERE country = 'NG' AND "vehicleType" = 'truck'
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
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
}
