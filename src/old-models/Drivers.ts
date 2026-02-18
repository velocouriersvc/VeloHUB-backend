import { Column, Entity, Index, JoinColumn, OneToMany, OneToOne } from "typeorm";
import { Deliveries } from './Deliveries'
import { Profiles } from './Profiles'
import { Orders } from './Orders'
import { RideBookings } from './RideBookings'
import { RideDriverResponses } from './RideDriverResponses'
import { RideRequestNotifications } from './RideRequestNotifications'
import { RideRequests } from './RideRequests'
import { Rides } from './Rides'
import { TripDriverQueue } from './TripDriverQueue'
import { Trips } from './Trips'


@Index("drivers_driving_license_number_key", ["drivingLicenseNumber",], { unique: true })
@Index("drivers_pkey", ["id",], { unique: true })
@Index("idx_drivers_id", ["id",], {})
@Index("drivers_is_online_idx", ["isOnline",], {})
@Index("idx_is_online", ["isOnline",], {})
@Index("idx_drivers_last_location", ["lastLocation",], {})
@Index("idx_drivers_location", ["lastLocation",], {})
@Index("drivers_last_location_gist", ["lastLocation",], {})
@Index("drivers_last_location_update_idx", ["lastLocationUpdate",], {})
@Index("drivers_online_active_idx", ["serviceMode", "vehicleType",], {})
@Index("drivers_service_mode_idx", ["serviceMode",], {})
@Index("drivers_online_mode_type_idx", ["serviceMode", "vehicleType",], {})
@Index("idx_drivers_service_tier", ["serviceTier",], {})
@Index("drivers_vehicle_type_idx", ["vehicleType",], {})
@Entity("drivers", { schema: "public" })
export class Drivers {

    @Column("uuid", { primary: true, name: "id" })
    id: string;

    @Column("character varying", { name: "address", nullable: true, length: 255 })
    address: string | null;

    @Column("character varying", { name: "vehicle_brand", nullable: true, length: 100 })
    vehicleBrand: string | null;

    @Column("character varying", { name: "vehicle_model", nullable: true, length: 100 })
    vehicleModel: string | null;

    @Column("character varying", { name: "vehicle_color", nullable: true, length: 50 })
    vehicleColor: string | null;

    @Column("character varying", { name: "vehicle_type", nullable: true, length: 50 })
    vehicleType: string | null;

    @Column("numeric", { name: "cargo_capacity", nullable: true, precision: 10, scale: 2 })
    cargoCapacity: string | null;

    @Column("character varying", { name: "license_plate", nullable: true, length: 20 })
    licensePlate: string | null;

    @Column("character varying", { name: "license_type", nullable: true, length: 50 })
    licenseType: string | null;

    @Column("character varying", { name: "driving_license_number", nullable: true, unique: true, length: 50 })
    drivingLicenseNumber: string | null;

    @Column("text", { name: "driving_license_front_url", nullable: true })
    drivingLicenseFrontUrl: string | null;

    @Column("text", { name: "driving_license_back_url", nullable: true })
    drivingLicenseBackUrl: string | null;

    @Column("character varying", { name: "driving_license_issuing_country", nullable: true, length: 3 })
    drivingLicenseIssuingCountry: string | null;

    @Column("boolean", { name: "kyc_verified", nullable: true, default: () => "false", })
    kycVerified: boolean | null;

    @Column("boolean", { name: "is_online", nullable: true, default: () => "false", })
    isOnline: boolean | null;

    @Column("character varying", { name: "service_mode", nullable: true, length: 20, default: () => "'both'", })
    serviceMode: string | null;

    @Column("double precision", { name: "current_lat", nullable: true, precision: 53 })
    currentLat: number | null;

    @Column("double precision", { name: "current_lng", nullable: true, precision: 53 })
    currentLng: number | null;

    @Column("timestamp with time zone", { name: "last_location_update", nullable: true })
    lastLocationUpdate: Date | null;

    @Column("numeric", { name: "acceptance_rate", nullable: true, precision: 5, scale: 2, default: () => "0.00", })
    acceptanceRate: string | null;

    @Column("numeric", { name: "average_rating", nullable: true, precision: 3, scale: 2, default: () => "0.00", })
    averageRating: string | null;

    @Column("integer", { name: "total_ratings", nullable: true, default: () => "0", })
    totalRatings: number | null;

    @Column("numeric", { name: "professionalism_score", nullable: true, precision: 5, scale: 2, default: () => "0.00", })
    professionalismScore: string | null;

    @Column("integer", { name: "total_completed_rides", nullable: true, default: () => "0", })
    totalCompletedRides: number | null;

    @Column("integer", { name: "total_completed_deliveries", nullable: true, default: () => "0", })
    totalCompletedDeliveries: number | null;

    @Column("numeric", { name: "total_earnings", nullable: true, precision: 12, scale: 2, default: () => "0.00", })
    totalEarnings: string | null;

    @Column("character varying", { name: "account_status", nullable: true, length: 20, default: () => "'active'", })
    accountStatus: string | null;

    @Column("text", { name: "suspension_reason", nullable: true })
    suspensionReason: string | null;

    @Column("integer", { name: "cancellation_count", nullable: true, default: () => "0", })
    cancellationCount: number | null;

    @Column("integer", { name: "flags_count", nullable: true, default: () => "0", })
    flagsCount: number | null;

    @Column("timestamp with time zone", { name: "created_at", nullable: true, default: () => "now()", })
    createdAt: Date | null;

    @Column("timestamp with time zone", { name: "updated_at", nullable: true, default: () => "now()", })
    updatedAt: Date | null;

    @Column("geography", { name: "last_location", nullable: true })
    lastLocation: string | null;

    @Column("timestamp with time zone", { name: "last_seen_at", nullable: true })
    lastSeenAt: Date | null;

    @Column("boolean", { name: "on_ride", default: () => "false", })
    onRide: boolean;

    @Column("text", { name: "vehicle_insurance_url", nullable: true })
    vehicleInsuranceUrl: string | null;

    @Column("text", { name: "road_worthiness_url", nullable: true })
    roadWorthinessUrl: string | null;

    @Column("text", { name: "service_tier", nullable: true, default: () => "'standard'", })
    serviceTier: string | null;

    @Column("text", { name: "ghana_card_front_url", nullable: true })
    ghanaCardFrontUrl: string | null;

    @Column("text", { name: "ghana_card_back_url", nullable: true })
    ghanaCardBackUrl: string | null;

    @OneToMany(() => Deliveries, deliveries => deliveries.driver)


    deliveries: Deliveries[];

    @OneToOne(() => Profiles, profiles => profiles.drivers, { onDelete: "CASCADE" })
    @JoinColumn([{ name: "id", referencedColumnName: "id" },
    ])

    profile: Profiles;

    @OneToMany(() => Orders, orders => orders.driver)


    orders: Orders[];

    @OneToMany(() => RideBookings, rideBookings => rideBookings.driver)


    rideBookings: RideBookings[];

    @OneToMany(() => RideDriverResponses, rideDriverResponses => rideDriverResponses.driver)


    rideDriverResponses: RideDriverResponses[];

    @OneToMany(() => RideRequestNotifications, rideRequestNotifications => rideRequestNotifications.driver)


    rideRequestNotifications: RideRequestNotifications[];

    @OneToMany(() => RideRequests, rideRequests => rideRequests.driver)


    rideRequests: RideRequests[];

    @OneToMany(() => Rides, rides => rides.assignedDriver)


    rides: Rides[];

    @OneToMany(() => TripDriverQueue, tripDriverQueue => tripDriverQueue.driver)


    tripDriverQueues: TripDriverQueue[];

    @OneToMany(() => Trips, trips => trips.driver)


    trips: Trips[];

}
