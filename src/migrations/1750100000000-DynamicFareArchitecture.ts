import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Dynamic Fare Architecture (June 19, 2026)
 * -----------------------------------------
 * Aligns the live DB with the new pricing spec:
 *   - GH/NG ride baselines (standard tier = client spec; tiers scale 0.75/1.0/1.5/2.5x)
 *   - Service fee is now 5% of subtotal (NG bumped 4% -> 5%)
 *   - Surge protection cap lowered to 1.4x across all markets
 *
 * Idempotent: pure UPDATEs keyed by country/vehicleType.
 */
export class DynamicFareArchitecture1750100000000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        // ── Ghana ride baselines (GHS) ──
        await queryRunner.query(`UPDATE vehicle_pricing SET "basePrice"=4.50,  "pricePerKm"=1.65, "pricePerMin"=0.30, "minimumFare"=8.00,  "riderServiceFee"=0 WHERE country='GH' AND "vehicleType"='bike'`);
        await queryRunner.query(`UPDATE vehicle_pricing SET "basePrice"=6.00,  "pricePerKm"=2.20, "pricePerMin"=0.40, "minimumFare"=10.00, "riderServiceFee"=0 WHERE country='GH' AND "vehicleType"='car'`);
        await queryRunner.query(`UPDATE vehicle_pricing SET "basePrice"=9.00,  "pricePerKm"=3.30, "pricePerMin"=0.60, "minimumFare"=15.00, "riderServiceFee"=0 WHERE country='GH' AND "vehicleType"='suv'`);
        await queryRunner.query(`UPDATE vehicle_pricing SET "basePrice"=15.00, "pricePerKm"=5.50, "pricePerMin"=1.00, "minimumFare"=25.00, "riderServiceFee"=0 WHERE country='GH' AND "vehicleType"='truck'`);

        // ── Nigeria ride baselines (NGN) ──
        await queryRunner.query(`UPDATE vehicle_pricing SET "basePrice"=300,  "pricePerKm"=82.50, "pricePerMin"=15, "minimumFare"=600,  "riderServiceFee"=0 WHERE country='NG' AND "vehicleType"='bike'`);
        await queryRunner.query(`UPDATE vehicle_pricing SET "basePrice"=400,  "pricePerKm"=110,   "pricePerMin"=20, "minimumFare"=800,  "riderServiceFee"=0 WHERE country='NG' AND "vehicleType"='car'`);
        await queryRunner.query(`UPDATE vehicle_pricing SET "basePrice"=600,  "pricePerKm"=165,   "pricePerMin"=30, "minimumFare"=1200, "riderServiceFee"=0 WHERE country='NG' AND "vehicleType"='suv'`);
        await queryRunner.query(`UPDATE vehicle_pricing SET "basePrice"=1000, "pricePerKm"=275,   "pricePerMin"=50, "minimumFare"=2000, "riderServiceFee"=0 WHERE country='NG' AND "vehicleType"='truck'`);

        // ── Service fee: 5% of subtotal (NG was 4%) ──
        await queryRunner.query(`UPDATE platform_settings SET "defaultServiceFeeRate"=5.00 WHERE country='NG'`);

        // ── Surge protection: cap at 1.4x across all markets ──
        await queryRunner.query(`UPDATE platform_settings SET "maxSurgeMultiplier"=1.40 WHERE "maxSurgeMultiplier" > 1.40`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Restore previous (pre-June-19) Ghana rates
        await queryRunner.query(`UPDATE vehicle_pricing SET "basePrice"=3.00,  "pricePerKm"=1.00, "pricePerMin"=0.40, "minimumFare"=10.00, "riderServiceFee"=3.00  WHERE country='GH' AND "vehicleType"='bike'`);
        await queryRunner.query(`UPDATE vehicle_pricing SET "basePrice"=5.00,  "pricePerKm"=2.00, "pricePerMin"=0.80, "minimumFare"=10.00, "riderServiceFee"=5.00  WHERE country='GH' AND "vehicleType"='car'`);
        await queryRunner.query(`UPDATE vehicle_pricing SET "basePrice"=8.00,  "pricePerKm"=3.50, "pricePerMin"=1.20, "minimumFare"=10.00, "riderServiceFee"=8.00  WHERE country='GH' AND "vehicleType"='suv'`);
        await queryRunner.query(`UPDATE vehicle_pricing SET "basePrice"=15.00, "pricePerKm"=5.00, "pricePerMin"=2.50, "minimumFare"=10.00, "riderServiceFee"=15.00 WHERE country='GH' AND "vehicleType"='truck'`);

        // Restore previous Nigeria rates
        await queryRunner.query(`UPDATE vehicle_pricing SET "basePrice"=500,  "pricePerKm"=130, "pricePerMin"=40,  "minimumFare"=4500,  "riderServiceFee"=400 WHERE country='NG' AND "vehicleType"='bike'`);
        await queryRunner.query(`UPDATE vehicle_pricing SET "basePrice"=800,  "pricePerKm"=200, "pricePerMin"=65,  "minimumFare"=6000,  "riderServiceFee"=400 WHERE country='NG' AND "vehicleType"='car'`);
        await queryRunner.query(`UPDATE vehicle_pricing SET "basePrice"=1200, "pricePerKm"=300, "pricePerMin"=95,  "minimumFare"=9000,  "riderServiceFee"=400 WHERE country='NG' AND "vehicleType"='suv'`);
        await queryRunner.query(`UPDATE vehicle_pricing SET "basePrice"=2000, "pricePerKm"=450, "pricePerMin"=140, "minimumFare"=12000, "riderServiceFee"=400 WHERE country='NG' AND "vehicleType"='truck'`);

        await queryRunner.query(`UPDATE platform_settings SET "defaultServiceFeeRate"=4.00 WHERE country='NG'`);
        await queryRunner.query(`UPDATE platform_settings SET "maxSurgeMultiplier"=2.50 WHERE country='GH'`);
        await queryRunner.query(`UPDATE platform_settings SET "maxSurgeMultiplier"=1.80 WHERE country='NG'`);
        await queryRunner.query(`UPDATE platform_settings SET "maxSurgeMultiplier"=2.00 WHERE country IN ('KE','ZA','TZ','UG')`);
    }
}
