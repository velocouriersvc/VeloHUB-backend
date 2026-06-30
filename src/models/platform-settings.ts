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

    // ── Order / Delivery ────────────────────────────────────────────

    @Column({ type: "decimal", precision: 10, scale: 2 })
    minimumOrderValue: number;

    /** Merchant commission on order subtotal (%) - merchant keeps (100 - this) */
    @Column({ type: "decimal", precision: 5, scale: 2, default: 15.00 })
    defaultCommissionRate: number;

    /** Customer-facing service fee rate on subtotal (%) */
    @Column({ type: "decimal", precision: 5, scale: 2, default: 5.00 })
    defaultServiceFeeRate: number;

    /** Max service fee cap (absolute value in local currency) */
    @Column({ type: "decimal", precision: 10, scale: 2, default: 4.99 })
    serviceFeeMaxCap: number;

    /** Small order fee (charged when subtotal < smallOrderThreshold) */
    @Column({ type: "decimal", precision: 10, scale: 2, default: 2.99 })
    smallOrderFee: number;

    /** Subtotal threshold below which smallOrderFee is applied */
    @Column({ type: "decimal", precision: 10, scale: 2, default: 15.00 })
    smallOrderThreshold: number;

    @Column({ type: "decimal", precision: 5, scale: 2, default: 10.00 })
    defaultPickupFeeRate: number;

    /** Delivery base fee (flat amount added to every delivery) */
    @Column({ type: "decimal", precision: 10, scale: 2 })
    deliveryBaseFee: number;

    /** Delivery distance fee (per km in local currency) */
    @Column({ type: "decimal", precision: 10, scale: 2 })
    deliveryPerKmFee: number;

    /** Driver payout as % of delivery fee (rest is platform) */
    @Column({ type: "decimal", precision: 5, scale: 2, default: 75.00 })
    driverDeliveryFeeShare: number;

    // ── Rides ───────────────────────────────────────────────────────

    /** Platform commission on ride fare (%) - driver keeps (100 - this) */
    @Column({ type: "decimal", precision: 5, scale: 2, default: 15.00 })
    rideCommissionRate: number;

    /** Flat rider service fee added on top of ride fare */
    @Column({ type: "decimal", precision: 10, scale: 2, default: 1.99 })
    riderServiceFee: number;

    /** Max surge multiplier allowed */
    @Column({ type: "decimal", precision: 3, scale: 2, default: 2.50 })
    maxSurgeMultiplier: number;

    // ── Delivery ride (when delivery driver is booked alongside an order) ─

    @Column({ type: "decimal", precision: 5, scale: 2, default: 40.00 })
    deliveryTotalCommissionRate: number;

    @Column({ type: "decimal", precision: 5, scale: 2, default: 50.00 })
    deliveryRidePortionRate: number;

    @Column({ type: "decimal", precision: 5, scale: 2, default: 50.00 })
    deliveryServicePortionRate: number;

    // ── Services / Bookings ─────────────────────────────────────────

    /** Platform commission on service booking (%) - provider keeps (100 - this) */
    @Column({ type: "decimal", precision: 5, scale: 2, default: 15.00 })
    serviceCommissionRate: number;

    /** Customer booking fee (0 = free to book) */
    @Column({ type: "decimal", precision: 10, scale: 2, default: 0.00 })
    serviceBookingFee: number;

    /** Late cancellation fee (after cancellation window) */
    @Column({ type: "decimal", precision: 10, scale: 2, default: 5.00 })
    lateCancellationFee: number;

    /** Late cancellation fee upper bound */
    @Column({ type: "decimal", precision: 10, scale: 2, default: 10.00 })
    lateCancellationFeeMax: number;

    /** Cancellation window in minutes before scheduled service */
    @Column({ type: "integer", default: 60 })
    cancellationWindowMinutes: number;

    // ── General ─────────────────────────────────────────────────────

    @Column({ type: "decimal", precision: 10, scale: 2, default: 5.00 })
    referralRewardAmount: number;

    @Column({ type: "integer", default: 10 })
    leaderboardLimit: number;

    @Column({ type: "boolean", default: false })
    isGlobalSurgeActive: boolean;

    @Column({ type: "decimal", precision: 5, scale: 2, default: 1.00 })
    globalSurgeMultiplier: number;

    @Column({ type: "boolean", default: true })
    ridesEnabled: boolean;

    @Column({ type: "boolean", default: true })
    deliveryEnabled: boolean;

    @Column({ type: "boolean", default: true })
    isActive: boolean;

    @UpdateDateColumn()
    updatedAt: Date;
}
