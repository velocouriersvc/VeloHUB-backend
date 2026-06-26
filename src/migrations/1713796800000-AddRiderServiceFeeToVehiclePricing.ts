import { MigrationInterface, QueryRunner, TableColumn } from "typeorm";

export class AddRiderServiceFeeToVehiclePricing1713796800000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.addColumn(
            "vehicle_pricing",
            new TableColumn({
                name: "riderServiceFee",
                type: "decimal",
                precision: 8,
                scale: 2,
                default: 1.99,
                isNullable: false,
            })
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.dropColumn("vehicle_pricing", "riderServiceFee");
    }
}
