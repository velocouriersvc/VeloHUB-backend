import { Column, Entity, Index, JoinColumn, OneToMany, OneToOne } from "typeorm";
import { MerchantNotifications } from './MerchantNotifications'
import { Profiles } from './Profiles'
import { OrderItems } from './OrderItems'
import { Orders } from './Orders'
import { Products } from './Products'
import { StoreShares } from './StoreShares'


@Index("idx_merchants_name", ["businessName",], {})
@Index("merchants_pkey", ["id",], { unique: true })
@Index("idx_merchants_is_open", ["isOpen",], {})
@Entity("merchants", { schema: "public" })
export class Merchants {

    @Column("uuid", { primary: true, name: "id" })
    id: string;

    @Column("character varying", { name: "business_name", length: 255 })
    businessName: string;

    @Column("character varying", { name: "business_type", nullable: true, length: 50 })
    businessType: string | null;

    @Column("character varying", { name: "business_license_number", nullable: true, length: 100 })
    businessLicenseNumber: string | null;

    @Column("character varying", { name: "tax_id", nullable: true, length: 50 })
    taxId: string | null;

    @Column("text", { name: "business_address" })
    businessAddress: string;

    @Column("numeric", { name: "business_lat", nullable: true, precision: 10, scale: 8 })
    businessLat: string | null;

    @Column("numeric", { name: "business_lng", nullable: true, precision: 11, scale: 8 })
    businessLng: string | null;

    @Column("character varying", { name: "business_phone", nullable: true, length: 20 })
    businessPhone: string | null;

    @Column("character varying", { name: "business_email", nullable: true, length: 255 })
    businessEmail: string | null;

    @Column("text", { name: "logo_url", nullable: true })
    logoUrl: string | null;

    @Column("text", { name: "banner_url", nullable: true })
    bannerUrl: string | null;

    @Column("text", { name: "description", nullable: true })
    description: string | null;

    @Column("jsonb", { name: "opening_hours", nullable: true })
    openingHours: object | null;

    @Column("boolean", { name: "is_open", nullable: true, default: () => "false", })
    isOpen: boolean | null;

    @Column("character varying", { name: "open_status", nullable: true, length: 20, default: () => "'default'", })
    openStatus: string | null;

    @Column("boolean", { name: "kyc_verified", nullable: true, default: () => "false", })
    kycVerified: boolean | null;

    @Column("numeric", { name: "average_rating", nullable: true, precision: 3, scale: 2, default: () => "0.00", })
    averageRating: string | null;

    @Column("integer", { name: "total_ratings", nullable: true, default: () => "0", })
    totalRatings: number | null;

    @Column("integer", { name: "total_orders", nullable: true, default: () => "0", })
    totalOrders: number | null;

    @Column("numeric", { name: "commission_rate", nullable: true, precision: 5, scale: 2, default: () => "15.00", })
    commissionRate: string | null;

    @Column("timestamp with time zone", { name: "created_at", nullable: true, default: () => "now()", })
    createdAt: Date | null;

    @Column("timestamp with time zone", { name: "updated_at", nullable: true, default: () => "now()", })
    updatedAt: Date | null;

    @Column("geography", { name: "business_location", nullable: true })
    businessLocation: string | null;

    @Column("uuid", { name: "owner_id", nullable: true })
    ownerId: string | null;

    @Column("text", { name: "ghana_card_front_url", nullable: true })
    ghanaCardFrontUrl: string | null;

    @Column("text", { name: "ghana_card_back_url", nullable: true })
    ghanaCardBackUrl: string | null;

    @Column("text", { name: "business_cert_url", nullable: true })
    businessCertUrl: string | null;

    @OneToMany(() => MerchantNotifications, merchantNotifications => merchantNotifications.merchant)


    merchantNotifications: MerchantNotifications[];

    @OneToOne(() => Profiles, profiles => profiles.merchants, { onDelete: "CASCADE" })
    @JoinColumn([{ name: "id", referencedColumnName: "id" },
    ])

    profile: Profiles;

    @OneToMany(() => OrderItems, orderItems => orderItems.merchant)


    orderItems: OrderItems[];

    @OneToMany(() => Orders, orders => orders.merchant)


    orders: Orders[];

    @OneToMany(() => Products, products => products.merchant)


    products: Products[];

    @OneToMany(() => StoreShares, storeShares => storeShares.vendor)


    storeShares: StoreShares[];

}
