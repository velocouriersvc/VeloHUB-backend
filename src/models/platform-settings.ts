import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    UpdateDateColumn,
} from "typeorm";

@Entity("platform_settings")
export class PlatformSettings {
    @PrimaryGeneratedColumn("uuid")
    id: string;

    @Column({ type: "varchar", length: 3, unique: true })
    country: string; // ISO 3166-1 alpha-2: 'GH','NG','IN','US','CA'

    @Column({ type: "varchar", length: 3 })
    currency: string; // 'GHS','NGN','INR','USD','CAD','EUR'

    @Column({ type: "decimal", precision: 10, scale: 2 })
    minimumOrderValue: number;

    @Column({ type: "decimal", precision: 5, scale: 2, default: 15.00 })
    defaultCommissionRate: number;

    @Column({ type: "decimal", precision: 5, scale: 2, default: 8.00 })
    defaultServiceFeeRate: number;

    @Column({ type: "decimal", precision: 5, scale: 2, default: 10.00 })
    defaultPickupFeeRate: number;

    @Column({ type: "decimal", precision: 10, scale: 2 })
    deliveryBaseFee: number;

    @Column({ type: "decimal", precision: 10, scale: 2 })
    deliveryPerKmFee: number;

    @Column({ type: "decimal", precision: 5, scale: 2, default: 20.00 })
    rideCommissionRate: number;

    @Column({ type: "decimal", precision: 5, scale: 2, default: 40.00 })
    deliveryTotalCommissionRate: number;

    @Column({ type: "decimal", precision: 5, scale: 2, default: 50.00 })
    deliveryRidePortionRate: number;

    @Column({ type: "decimal", precision: 5, scale: 2, default: 50.00 })
    deliveryServicePortionRate: number;

    @Column({ type: "decimal", precision: 5, scale: 2, default: 15.00 })
    serviceCommissionRate: number;

    @Column({ type: "decimal", precision: 10, scale: 2, default: 5.00 })
    referralRewardAmount: number;

    @Column({ type: "integer", default: 10 })
    leaderboardLimit: number;

    @Column({ type: "boolean", default: true })
    isActive: boolean;

    @UpdateDateColumn()
    updatedAt: Date;
}
