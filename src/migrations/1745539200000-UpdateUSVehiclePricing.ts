import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Updates US vehicle pricing to client-specified April 2026 rates.
 * Per-mile rates converted to per-km (÷ 1.60934).
 *
 *   Velo Go      (bike)  | base $1.00 | $1.30/mi → $0.81/km | $0.13/min | min $10 | fee $3
 *   Velo Standard(car)   | base $2.50 | $1.90/mi → $1.18/km | $0.21/min | min $10 | fee $3
 *   Velo Comfort (suv)   | base $6.00 | $3.80/mi → $2.36/km | $0.38/min | min $15 | fee $3
 *   Velo Truck   (truck) | base $15.00| $6.20/mi → $3.85/km | $0.72/min | min $25 | fee $3
 */
export class UpdateUSVehiclePricing1745539200000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            UPDATE vehicle_pricing SET
                "basePrice"       = 1.00,
                "pricePerKm"      = 0.81,
                "pricePerMin"     = 0.13,
                "minimumFare"     = 10.00,
                "riderServiceFee" = 3.00
            WHERE country = 'US' AND "vehicleType" = 'bike'
        `);

        await queryRunner.query(`
            UPDATE vehicle_pricing SET
                "basePrice"       = 2.50,
                "pricePerKm"      = 1.18,
                "pricePerMin"     = 0.21,
                "minimumFare"     = 10.00,
                "riderServiceFee" = 3.00
            WHERE country = 'US' AND "vehicleType" = 'car'
        `);

        await queryRunner.query(`
            UPDATE vehicle_pricing SET
                "basePrice"       = 6.00,
                "pricePerKm"      = 2.36,
                "pricePerMin"     = 0.38,
                "minimumFare"     = 15.00,
                "riderServiceFee" = 3.00
            WHERE country = 'US' AND "vehicleType" = 'suv'
        `);

        await queryRunner.query(`
            UPDATE vehicle_pricing SET
                "basePrice"       = 15.00,
                "pricePerKm"      = 3.85,
                "pricePerMin"     = 0.72,
                "minimumFare"     = 25.00,
                "riderServiceFee" = 3.00
            WHERE country = 'US' AND "vehicleType" = 'truck'
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Restores the previous values from migration 1745100000000
        await queryRunner.query(`
            UPDATE vehicle_pricing SET
                "basePrice"       = 2.00,
                "pricePerKm"      = 0.62,
                "pricePerMin"     = 0.20,
                "minimumFare"     = 5.00,
                "riderServiceFee" = 1.99
            WHERE country = 'US' AND "vehicleType" = 'bike'
        `);
        await queryRunner.query(`
            UPDATE vehicle_pricing SET
                "minimumFare" = 6.00
            WHERE country = 'US' AND "vehicleType" = 'car'
        `);
    }
}
