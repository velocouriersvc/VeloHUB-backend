import { Column, Entity, Index, OneToMany, OneToOne } from "typeorm";
import { AdminAlerts } from "./AdminAlerts";
import { ApiErrors } from "./ApiErrors";
import { AuditLogs } from "./AuditLogs";
import { Bookings } from "./Bookings";
import { BuyerProfiles } from "./BuyerProfiles";
import { CartItems } from "./CartItems";
import { DriverProfiles } from "./DriverProfiles";
import { InventoryItems } from "./InventoryItems";
import { LeaseRequests } from "./LeaseRequests";
import { LeaseVehicles } from "./LeaseVehicles";
import { NotificationsLog } from "./NotificationsLog";
import { NotificationsQueue } from "./NotificationsQueue";
import { OrderIssues } from "./OrderIssues";
import { Orders } from "./Orders";
import { PaymentMethodRequests } from "./PaymentMethodRequests";
import { Payments } from "./Payments";
import { Products } from "./Products";
import { RecentLocations } from "./RecentLocations";
import { Referrals } from "./Referrals";
import { ReviewRequests } from "./ReviewRequests";
import { Reviews } from "./Reviews";
import { RideRequests } from "./RideRequests";
import { SellerPayouts } from "./SellerPayouts";
import { SellerProfiles } from "./SellerProfiles";
import { ShopForMeRequests } from "./ShopForMeRequests";
import { UserRoles } from "./UserRoles";
import { VeloOrders } from "./VeloOrders";
import { Vendors } from "./Vendors";
import { WalletTransactions } from "./WalletTransactions";

@Index("profiles_pkey", ["id"], { unique: true })
@Index("profiles_phone_number_key", ["phoneNumber"], { unique: true })
@Index("idx_profiles_phone", ["phoneNumber"], {})
@Index("profiles_referral_code_key", ["referralCode"], { unique: true })
@Index("idx_profiles_stripe_customer_id", ["stripeCustomerId"], {})
@Entity("profiles", { schema: "public" })
export class Profiles {
  @Column("uuid", {
    primary: true,
    name: "id",
    default: () => "gen_random_uuid()",
  })
  id: string;

  @Column("text", { name: "phone_number", unique: true })
  phoneNumber: string;

  @Column("text", { name: "name", nullable: true })
  name: string | null;

  @Column("text", { name: "location", nullable: true })
  location: string | null;

  @Column("timestamp with time zone", {
    name: "created_at",
    nullable: true,
    default: () => "now()",
  })
  createdAt: Date | null;

  @Column("timestamp with time zone", {
    name: "updated_at",
    nullable: true,
    default: () => "now()",
  })
  updatedAt: Date | null;

  @Column("text", { name: "ghana_card_number", nullable: true })
  ghanaCardNumber: string | null;

  @Column("text", { name: "referral_code", nullable: true, unique: true })
  referralCode: string | null;

  @Column("text", { name: "referred_by", nullable: true })
  referredBy: string | null;

  @Column("numeric", {
    name: "referral_credits",
    nullable: true,
    default: () => "0",
  })
  referralCredits: string | null;

  @Column("integer", {
    name: "total_referrals",
    nullable: true,
    default: () => "0",
  })
  totalReferrals: number | null;

  @Column("text", { name: "stripe_customer_id", nullable: true })
  stripeCustomerId: string | null;

  @OneToMany(() => AdminAlerts, (adminAlerts) => adminAlerts.acknowledgedBy)
  adminAlerts: AdminAlerts[];

  @OneToMany(() => ApiErrors, (apiErrors) => apiErrors.user)
  apiErrors: ApiErrors[];

  @OneToMany(() => AuditLogs, (auditLogs) => auditLogs.user)
  auditLogs: AuditLogs[];

  @OneToMany(() => Bookings, (bookings) => bookings.user)
  bookings: Bookings[];

  @OneToOne(() => BuyerProfiles, (buyerProfiles) => buyerProfiles.profile)
  buyerProfiles: BuyerProfiles;

  @OneToMany(() => CartItems, (cartItems) => cartItems.user)
  cartItems: CartItems[];

  @OneToOne(() => DriverProfiles, (driverProfiles) => driverProfiles.profile)
  driverProfiles: DriverProfiles;

  @OneToMany(() => InventoryItems, (inventoryItems) => inventoryItems.seller)
  inventoryItems: InventoryItems[];

  @OneToMany(() => LeaseRequests, (leaseRequests) => leaseRequests.user)
  leaseRequests: LeaseRequests[];

  @OneToMany(() => LeaseVehicles, (leaseVehicles) => leaseVehicles.owner)
  leaseVehicles: LeaseVehicles[];

  @OneToMany(
    () => NotificationsLog,
    (notificationsLog) => notificationsLog.recipient
  )
  notificationsLogs: NotificationsLog[];

  @OneToMany(
    () => NotificationsQueue,
    (notificationsQueue) => notificationsQueue.recipient
  )
  notificationsQueues: NotificationsQueue[];

  @OneToMany(() => OrderIssues, (orderIssues) => orderIssues.buyer)
  orderIssues: OrderIssues[];

  @OneToMany(() => Orders, (orders) => orders.seller)
  orders: Orders[];

  @OneToMany(() => Orders, (orders) => orders.user)
  orders2: Orders[];

  @OneToMany(
    () => PaymentMethodRequests,
    (paymentMethodRequests) => paymentMethodRequests.user
  )
  paymentMethodRequests: PaymentMethodRequests[];

  @OneToMany(() => Payments, (payments) => payments.user)
  payments: Payments[];

  @OneToMany(() => Products, (products) => products.seller)
  products: Products[];

  @OneToMany(() => RecentLocations, (recentLocations) => recentLocations.user)
  recentLocations: RecentLocations[];

  @OneToMany(() => Referrals, (referrals) => referrals.referred)
  referrals: Referrals[];

  @OneToMany(() => Referrals, (referrals) => referrals.referrer)
  referrals2: Referrals[];

  @OneToMany(() => ReviewRequests, (reviewRequests) => reviewRequests.buyer)
  reviewRequests: ReviewRequests[];

  @OneToMany(() => ReviewRequests, (reviewRequests) => reviewRequests.seller)
  reviewRequests2: ReviewRequests[];

  @OneToMany(() => Reviews, (reviews) => reviews.reviewer)
  reviews: Reviews[];

  @OneToMany(() => RideRequests, (rideRequests) => rideRequests.user)
  rideRequests: RideRequests[];

  @OneToMany(() => SellerPayouts, (sellerPayouts) => sellerPayouts.seller)
  sellerPayouts: SellerPayouts[];

  @OneToOne(() => SellerProfiles, (sellerProfiles) => sellerProfiles.profile)
  sellerProfiles: SellerProfiles;

  @OneToMany(
    () => ShopForMeRequests,
    (shopForMeRequests) => shopForMeRequests.buyer
  )
  shopForMeRequests: ShopForMeRequests[];

  @OneToMany(() => UserRoles, (userRoles) => userRoles.profile)
  userRoles: UserRoles[];

  @OneToMany(() => VeloOrders, (veloOrders) => veloOrders.user)
  veloOrders: VeloOrders[];

  @OneToMany(() => Vendors, (vendors) => vendors.seller)
  vendors: Vendors[];

  @OneToMany(
    () => WalletTransactions,
    (walletTransactions) => walletTransactions.profile
  )
  walletTransactions: WalletTransactions[];
}
