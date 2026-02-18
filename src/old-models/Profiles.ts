import { Column, Entity, Index, JoinColumn, ManyToOne, OneToMany, OneToOne } from "typeorm";
import { ActiveUserRole } from './ActiveUserRole'
import { BuyerInformation } from './BuyerInformation'
import { Drivers } from './Drivers'
import { IdCards } from './IdCards'
import { Merchants } from './Merchants'
import { OrderIssues } from './OrderIssues'
import { Orders } from './Orders'
import { PaymentMethods } from './PaymentMethods'
import { PromotionUsages } from './PromotionUsages'
import { Promotions } from './Promotions'
import { PushNotificationTokens } from './PushNotificationTokens'
import { ReviewRequests } from './ReviewRequests'
import { RideBookings } from './RideBookings'
import { Rides } from './Rides'
import { SavedAddresses } from './SavedAddresses'
import { SellerProfiles } from './SellerProfiles'
import { TripPayments } from './TripPayments'
import { TripQuotes } from './TripQuotes'
import { Trips } from './Trips'
import { UserRoleEvents } from './UserRoleEvents'
import { UserRoles } from './UserRoles'
import { Withdrawals } from './Withdrawals'


@Index("profiles_email_key", ["email",], { unique: true })
@Index("idx_full_name", ["fullName",], {})
@Index("profiles_pkey", ["id",], { unique: true })
@Index("idx_profiles_phone", ["phoneNumber",], {})
@Index("profiles_phone_number_key", ["phoneNumber",], { unique: true })
@Index("profiles_referral_code_key", ["referralCode",], { unique: true })
@Entity("profiles", { schema: "public" })
export class Profiles {

    @Column("uuid", { primary: true, name: "id" })
    id: string;

    @Column("character varying", { name: "phone_number", unique: true, length: 20 })
    phoneNumber: string;

    @Column("character varying", { name: "full_name", length: 255 })
    fullName: string;

    @Column("character varying", { name: "country", nullable: true, length: 100 })
    country: string | null;

    @Column("character varying", { name: "region", nullable: true, length: 100 })
    region: string | null;

    @Column("character varying", { name: "city", nullable: true, length: 100 })
    city: string | null;

    @Column("character varying", { name: "email", nullable: true, unique: true, length: 255 })
    email: string | null;

    @Column("text", { name: "avatar_url", nullable: true })
    avatarUrl: string | null;

    @Column("boolean", { name: "is_active", nullable: true, default: () => "true", })
    isActive: boolean | null;

    @Column("boolean", { name: "otp_verified", nullable: true, default: () => "false", })
    otpVerified: boolean | null;

    @Column("timestamp with time zone", { name: "phone_verified_at", nullable: true })
    phoneVerifiedAt: Date | null;

    @Column("timestamp with time zone", { name: "created_at", nullable: true, default: () => "now()", })
    createdAt: Date | null;

    @Column("timestamp with time zone", { name: "updated_at", nullable: true, default: () => "now()", })
    updatedAt: Date | null;

    @Column("character varying", { name: "user_type", default: () => "'buyer'", })
    userType: string;

    @Column("geography", { name: "last_location", nullable: true })
    lastLocation: string | null;

    @Column("text", { name: "referral_code", nullable: true })
    referralCode: string | null;

    @Column("numeric", { name: "referral_credits", nullable: true, default: () => "0", })
    referralCredits: string | null;

    @Column("text", { name: "referred_by", nullable: true })
    referredBy: string | null;

    @Column("integer", { name: "total_referrals", nullable: true, default: () => "0", })
    totalReferrals: number | null;

    @OneToOne(() => ActiveUserRole, activeUserRole => activeUserRole.profile)


    activeUserRole: ActiveUserRole;

    @OneToOne(() => BuyerInformation, buyerInformation => buyerInformation.profile)


    buyerInformation: BuyerInformation;

    @OneToOne(() => Drivers, drivers => drivers.profile)


    drivers: Drivers;

    @OneToMany(() => IdCards, idCards => idCards.profile)


    idCards: IdCards[];

    @OneToOne(() => Merchants, merchants => merchants.profile)


    merchants: Merchants;

    @OneToMany(() => OrderIssues, orderIssues => orderIssues.buyer)


    orderIssues: OrderIssues[];

    @OneToMany(() => Orders, orders => orders.buyer_2)


    orders: Orders[];

    @OneToMany(() => PaymentMethods, paymentMethods => paymentMethods.user)


    paymentMethods: PaymentMethods[];

    @ManyToOne(() => IdCards, idCards => idCards.profiles, { onDelete: "SET NULL" })
    @JoinColumn([{ name: "id_card_id", referencedColumnName: "id" },
    ])

    idCard: IdCards;

    @OneToMany(() => PromotionUsages, promotionUsages => promotionUsages.user)


    promotionUsages: PromotionUsages[];

    @OneToMany(() => Promotions, promotions => promotions.createdBy)


    promotions: Promotions[];

    @OneToMany(() => PushNotificationTokens, pushNotificationTokens => pushNotificationTokens.profile)


    pushNotificationTokens: PushNotificationTokens[];

    @OneToMany(() => ReviewRequests, reviewRequests => reviewRequests.buyer)


    reviewRequests: ReviewRequests[];

    @OneToMany(() => ReviewRequests, reviewRequests => reviewRequests.seller)


    reviewRequests2: ReviewRequests[];

    @OneToMany(() => RideBookings, rideBookings => rideBookings.buyer_2)


    rideBookings: RideBookings[];

    @OneToMany(() => RideBookings, rideBookings => rideBookings.cancelledBy)


    rideBookings2: RideBookings[];

    @OneToMany(() => RideBookings, rideBookings => rideBookings.driver_2)


    rideBookings3: RideBookings[];

    @OneToMany(() => Rides, rides => rides.rider)


    rides: Rides[];

    @OneToOne(() => SavedAddresses, savedAddresses => savedAddresses.user)


    savedAddresses: SavedAddresses;

    @OneToMany(() => SellerProfiles, sellerProfiles => sellerProfiles.profile)


    sellerProfiles: SellerProfiles[];

    @OneToMany(() => TripPayments, tripPayments => tripPayments.user)


    tripPayments: TripPayments[];

    @OneToMany(() => TripQuotes, tripQuotes => tripQuotes.user)


    tripQuotes: TripQuotes[];

    @OneToMany(() => Trips, trips => trips.rider)


    trips: Trips[];

    @OneToMany(() => UserRoleEvents, userRoleEvents => userRoleEvents.profile)


    userRoleEvents: UserRoleEvents[];

    @OneToMany(() => UserRoles, userRoles => userRoles.profile)


    userRoles: UserRoles[];

    @OneToMany(() => Withdrawals, withdrawals => withdrawals.user)


    withdrawals: Withdrawals[];

}
