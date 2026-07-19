import { AppDataSource } from "../../db/data-source";
import { Payment, PaymentMethodType, PaymentRecordStatus } from "../../models/payment";
import { PlatformSettings } from "../../models/platform-settings";
import { PaymentProvider } from "./payment-provider.interface";
import { paymentProviderRegistry } from "./payment-provider-registry";
import { WalletService } from "../wallet-service";
import { NotificationService } from "../notification-service";
import { NotificationType } from "../../models/notification";
import { v4 as uuidv4 } from "uuid";
import { createServiceLogger } from "../../utils/logger";
import { paymentEventsTotal } from "../../utils/metrics";
import { formatCurrency, currencyForCountry } from "../../utils/currency";
import { ServiceSubscription, ServiceSubscriptionStatus } from "../../models/service-subscription";
import { BuyerProfile } from "../../models/buyer-profile";
import { ScheduledRide, ScheduledPaymentStatus } from "../../models/scheduled-ride";
import { Ride, RideStatus, PaymentStatus as RidePaymentStatus } from "../../models/ride";
import { Order, OrderPaymentStatus } from "../../models/order";

const log = createServiceLogger("PaymentService");

// Fallbacks - used only when platform_settings lookup fails
const DEFAULT_PLATFORM_COMMISSION = 0.2;
const DEFAULT_DRIVER_SHARE = 0.8;

export interface PaymentResult {
    success: boolean;
    paymentId: string;
    reference: string;
    status: PaymentRecordStatus;
    authorizationUrl?: string; // For momo redirect flows
    clientSecret?: string;     // For Stripe Payment Sheet
    message?: string;
}

export class PaymentService {
    private paymentRepo = AppDataSource.getRepository(Payment);
    private rideRepo = AppDataSource.getRepository(Ride);
    private orderRepo = AppDataSource.getRepository(Order);
    private scheduledRideRepo = AppDataSource.getRepository(ScheduledRide);
    private settingsRepo = AppDataSource.getRepository(PlatformSettings);
    private walletService: WalletService;
    private notificationService: NotificationService;

    constructor() {
        this.walletService = new WalletService();
        this.notificationService = new NotificationService();
    }

    // ── Stripe PaymentIntent ────────────────────────────────────────

    /**
     * Create a Stripe PaymentIntent for card payments.
     * Called by the frontend BEFORE showing the Stripe Payment Sheet.
     * Returns the clientSecret the mobile app needs to confirm payment.
     */
    async createPaymentIntent(params: {
        userId: string;
        amount: number;
        currency: string;
        metadata?: Record<string, any>;
    }): Promise<{
        success: boolean;
        clientSecret: string;
        paymentIntentId: string;
        paymentId: string;
    }> {
        const stripe = paymentProviderRegistry.getStripeProvider();
        const reference = `CARD-${uuidv4().slice(0, 12)}`;

        // Create a pending payment record
        const payment = this.paymentRepo.create({
            userId: params.userId,
            amount: params.amount,
            currency: params.currency,
            method: PaymentMethodType.CARD,
            provider: "stripe",
            providerRef: null,
            providerStatus: null,
            platformFee: 0,
            driverAmount: 0,
            status: PaymentRecordStatus.PENDING,
            metadata: {
                reference,
                ...params.metadata,
            },
            rideId: params.metadata?.rideId || null,
            orderId: params.metadata?.orderId || null,
            serviceBookingId: params.metadata?.serviceBookingId || null,
            subscriptionId: params.metadata?.subscriptionId || null,
        });
        const saved = await this.paymentRepo.save(payment);

        const result = await stripe.createPaymentIntent({
            amount: params.amount,
            currency: params.currency,
            metadata: {
                paymentId: saved.id,
                userId: params.userId,
                reference,
                ...params.metadata,
            },
        });

        if (!result.success) {
            saved.status = PaymentRecordStatus.FAILED;
            saved.providerStatus = "intent_creation_failed";
            await this.paymentRepo.save(saved);
            log.error("Failed to create PaymentIntent", { paymentId: saved.id });

            return {
                success: false,
                clientSecret: "",
                paymentIntentId: "",
                paymentId: saved.id,
            };
        }

        // Update payment with Stripe's PaymentIntent ID
        saved.providerRef = result.paymentIntentId;
        saved.providerStatus = "requires_payment_method";
        await this.paymentRepo.save(saved);

        log.info("PaymentIntent created for card payment", {
            paymentId: saved.id,
            paymentIntentId: result.paymentIntentId,
        });

        return {
            success: true,
            clientSecret: result.clientSecret,
            paymentIntentId: result.paymentIntentId,
            paymentId: saved.id,
        };
    }

    // ── Helpers ──────────────────────────────────────────────────────

    /**
     * Resolve provider + currency + commission from the user's country.
     */
    // Currencies THIS Paystack account can charge. The live Ghana integration
    // has ONLY GHS enabled: on 2026-07-17 converted USD charges were rejected
    // with "Currency not supported by merchant" just like NGN. Override per
    // deployment via PAYSTACK_SUPPORTED_CURRENCIES=GHS,USD,NGN once Paystack
    // enables more currencies on the account.
    private static readonly PAYSTACK_ACCOUNT_CURRENCIES = (process.env.PAYSTACK_SUPPORTED_CURRENCIES || "GHS")
        .split(",").map((c) => c.trim().toUpperCase()).filter(Boolean);

    // Currency that unsupported-currency charges are converted INTO. Must be
    // enabled on the Paystack account. Defaults to the first supported currency.
    private static readonly PAYSTACK_SETTLEMENT_CURRENCY = (process.env.PAYSTACK_SETTLEMENT_CURRENCY
        || PaymentService.PAYSTACK_ACCOUNT_CURRENCIES[0] || "GHS").toUpperCase();

    private async resolveCountryContext(country: string): Promise<{
        provider: PaymentProvider;
        currency: string;
        commissionRate: number;
    }> {
        const provider = paymentProviderRegistry.getProvider(country);

        const settings = await this.settingsRepo.findOne({
            where: { country, isActive: true },
        });

        const currency = settings?.currency || currencyForCountry(country);
        // defaultCommissionRate is stored as a percentage (e.g. 15 = 15%)
        const commissionRate = settings
            ? Number(settings.defaultCommissionRate) / 100
            : DEFAULT_PLATFORM_COMMISSION;

        return { provider, currency, commissionRate };
    }

    /** Units of a currency per 1 USD, from the admin-managed platform settings. */
    private async usdRateFor(currency: string): Promise<number> {
        if (currency === "USD") return 1;
        const settings = await this.settingsRepo.findOne({ where: { currency, isActive: true } });
        return Number(settings?.usdExchangeRate) || 0;
    }

    /**
     * Charge details for a Paystack gateway call: when the account cannot charge
     * the local currency, convert the amount into the settlement currency (GHS)
     * using the admin-managed usdExchangeRate cross rate. The returned `rate` is
     * local units per 1 settlement unit, so fees convert with the same divisor.
     */
    private async gatewayCharge(amount: number, currency: string): Promise<{ amount: number; currency: string; converted: boolean; rate: number }> {
        if (PaymentService.PAYSTACK_ACCOUNT_CURRENCIES.includes(currency.toUpperCase())) {
            return { amount, currency, converted: false, rate: 1 };
        }
        const target = PaymentService.PAYSTACK_SETTLEMENT_CURRENCY;
        const localRate = await this.usdRateFor(currency);
        const targetRate = await this.usdRateFor(target);
        // A rate of 0 means the currency was never seeded; converting would
        // mischarge, so fail loud at initialize instead. USD is legitimately 1.
        if (localRate <= 0 || targetRate <= 0) {
            log.error("No usable exchange rate for unsupported currency; initialize will be rejected", { currency, target, localRate, targetRate });
            return { amount, currency, converted: false, rate: 1 };
        }
        const rate = localRate / targetRate;
        const converted = Math.max(0.1, Math.round((amount / rate) * 100) / 100);
        log.info("Converting gateway charge to settlement currency", { currency, amount, target, converted, rate });
        return { amount: converted, currency: target, converted: true, rate };
    }

    /**
     * Apply the settlement-currency conversion (if needed) to the Payment row
     * and return the amount/currency to send to the gateway. Local prices stay
     * on the order; originals are kept in payment.metadata for reconciliation.
     */
    private async prepareGatewayCharge(
        payment: Payment,
        provider: PaymentProvider,
        amount: number,
        currency: string
    ): Promise<{ amount: number; currency: string }> {
        if (provider.name !== "paystack") return { amount, currency };
        const charge = await this.gatewayCharge(amount, currency);
        if (charge.converted) {
            const fx = (v: number) => Math.round((Number(v || 0) / charge.rate) * 100) / 100;
            payment.metadata = { ...payment.metadata, originalAmount: amount, originalCurrency: currency, fxRate: charge.rate };
            payment.amount = charge.amount;
            payment.currency = charge.currency;
            payment.platformFee = fx(payment.platformFee);
            payment.driverAmount = fx(payment.driverAmount);
        }
        return { amount: charge.amount, currency: charge.currency };
    }

    // ── Ride Payments ───────────────────────────────────────────────

    /**
     * Process a ride payment based on payment method
     */
    async processRidePayment(params: {
        rideId: string;
        userId: string;
        amount: number;
        riderServiceFee?: number;
        method: PaymentMethodType;
        country?: string;
        email?: string;
        phoneNumber?: string;
    }): Promise<PaymentResult> {
        const { rideId, userId, amount, method } = params;
        const riderServiceFee = params.riderServiceFee || 0;
        const country = params.country || "GH";
        const { provider, currency, commissionRate } = await this.resolveCountryContext(country);

        const reference = `RIDE-${uuidv4().slice(0, 12)}`;

        // Commission applies to the fare portion only, NOT the rider service fee
        const farePortionBeforeDiscount = amount - riderServiceFee;
        const platformFee = Math.round((farePortionBeforeDiscount * commissionRate + riderServiceFee) * 100) / 100;
        const driverAmount = Math.round(farePortionBeforeDiscount * (1 - commissionRate) * 100) / 100;

        // Create payment record
        const payment = this.paymentRepo.create({
            rideId,
            userId,
            amount,
            currency,
            method,
            provider: method === PaymentMethodType.WALLET ? "wallet" : provider.name,
            providerRef: null,
            providerStatus: null,
            platformFee,
            driverAmount,
            status: PaymentRecordStatus.PENDING,
            metadata: { reference },
        });
        const saved = await this.paymentRepo.save(payment);
        log.info("Payment record created", { paymentId: saved.id, rideId, method, amount, currency });

        switch (method) {
            case PaymentMethodType.MOMO:
                return this.processMomoPayment(saved, reference, params, provider, currency);

            case PaymentMethodType.CARD:
                return this.processCardViaPaystack(saved, reference, params, provider, currency);

            case PaymentMethodType.WALLET:
                return this.processWalletPayment(saved, reference, userId, amount);

            case PaymentMethodType.CASH:
                return this.processCashPayment(saved, reference);

            default:
                throw new Error(`Unsupported payment method: ${method}`);
        }
    }

    /**
     * Upfront payment for a scheduled ride. Same money split as a live ride, but the
     * payment links to a `scheduledRideId` instead of a `rideId`. momo/card return a
     * prompt/authorization URL; cash is registered as pay-at-ride.
     */
    async processScheduledRidePayment(params: {
        scheduledRideId: string;
        userId: string;
        amount: number;
        method: PaymentMethodType;
        country?: string;
        email?: string;
        phoneNumber?: string;
    }): Promise<PaymentResult> {
        const { scheduledRideId, userId, amount, method } = params;
        const country = params.country || "GH";
        const { provider, currency, commissionRate } = await this.resolveCountryContext(country);

        const reference = `SCHED-${uuidv4().slice(0, 12)}`;
        const platformFee = Math.round(amount * commissionRate * 100) / 100;
        const driverAmount = Math.round(amount * (1 - commissionRate) * 100) / 100;

        const payment = this.paymentRepo.create({
            scheduledRideId,
            userId,
            amount,
            currency,
            method,
            provider: method === PaymentMethodType.WALLET ? "wallet" : provider.name,
            providerRef: null,
            providerStatus: null,
            platformFee,
            driverAmount,
            status: PaymentRecordStatus.PENDING,
            metadata: { reference, scheduledRideId },
        });
        const saved = await this.paymentRepo.save(payment);
        log.info("Scheduled ride payment record created", { paymentId: saved.id, scheduledRideId, method, amount, currency });

        switch (method) {
            case PaymentMethodType.MOMO:
                return this.processMomoPayment(saved, reference, params, provider, currency);
            case PaymentMethodType.CARD:
                return this.processCardViaPaystack(saved, reference, params, provider, currency);
            case PaymentMethodType.WALLET:
                return this.processWalletPayment(saved, reference, userId, amount);
            case PaymentMethodType.CASH:
                return this.processCashPayment(saved, reference);
            default:
                throw new Error(`Unsupported payment method: ${method}`);
        }
    }

    /**
     * Refund a scheduled ride's prepayment to the customer's wallet. Cash has nothing
     * to refund. Returns the amount refunded.
     */
    async refundScheduledRidePayment(scheduledRideId: string): Promise<number> {
        const payment = await this.paymentRepo.findOne({
            where: { scheduledRideId, status: PaymentRecordStatus.SUCCESS },
        });
        if (!payment || payment.method === PaymentMethodType.CASH) return 0;

        const amount = Number(payment.amount);
        const desc = `Refund for cancelled scheduled ride ${scheduledRideId}`;
        const meta = { scheduledRideId, paymentId: payment.id, type: "scheduled_ride_refund" };
        try {
            await this.walletService.credit(payment.userId, amount, desc, meta);
        } catch (e) {
            if (/Wallet not found/i.test((e as Error).message)) {
                await this.walletService.createWallet(payment.userId);
                await this.walletService.credit(payment.userId, amount, desc, meta);
            } else {
                throw e;
            }
        }

        payment.status = PaymentRecordStatus.REFUNDED;
        await this.paymentRepo.save(payment);
        log.info("Scheduled ride payment refunded to wallet", { scheduledRideId, amount });
        return amount;
    }

    /** Mark a scheduled ride as prepaid once its upfront payment succeeds. */
    async markScheduledRidePaid(scheduledRideId: string): Promise<void> {
        await this.scheduledRideRepo.update(
            { id: scheduledRideId },
            { paymentStatus: ScheduledPaymentStatus.PAID }
        );
        log.info("Scheduled ride marked paid", { scheduledRideId });
    }

    /**
     * Full refund of a ride's prepayment to the customer's wallet. Used when a
     * customer cancels for a valid reason (e.g. the driver's vehicle/plate does not
     * match). Cash rides have nothing to refund. Returns the amount refunded.
     */
    async refundRidePayment(rideId: string): Promise<number> {
        const payment = await this.paymentRepo.findOne({
            where: { rideId, status: PaymentRecordStatus.SUCCESS },
        });
        if (!payment || payment.method === PaymentMethodType.CASH) return 0;

        const amount = Number(payment.amount);
        const desc = `Refund for cancelled ride ${rideId}`;
        const meta = { rideId, paymentId: payment.id, type: "ride_refund" };
        try {
            await this.walletService.credit(payment.userId, amount, desc, meta);
        } catch (e) {
            // Auto-create the wallet on first credit, then retry.
            if (/Wallet not found/i.test((e as Error).message)) {
                await this.walletService.createWallet(payment.userId);
                await this.walletService.credit(payment.userId, amount, desc, meta);
            } else {
                throw e;
            }
        }

        payment.status = PaymentRecordStatus.REFUNDED;
        await this.paymentRepo.save(payment);
        log.info("Ride payment refunded to wallet", { rideId, amount });
        return amount;
    }

    // ── Order Payments ──────────────────────────────────────────────

    /**
     * Process a marketplace order payment (country-aware from day one)
     */
    async processOrderPayment(params: {
        orderId: string;
        userId: string;
        amount: number;
        subtotal?: number;
        serviceFee?: number;
        smallOrderFee?: number;
        deliveryFee?: number;
        method: PaymentMethodType;
        country?: string;
        email?: string;
        phoneNumber?: string;
    }): Promise<PaymentResult> {
        const { orderId, userId, amount, method } = params;
        const country = params.country || "GH";
        const { provider, currency, commissionRate } = await this.resolveCountryContext(country);

        const reference = `ORD-${uuidv4().slice(0, 12)}`;

        // Merchant earns: subtotal minus commission (15% of subtotal)
        // Platform keeps: commission + service fee + small order fee
        // Delivery fee: split handled at settlement (75% driver / 25% platform)
        const subtotal = params.subtotal || amount;
        const serviceFee = params.serviceFee || 0;
        const smallOrderFee = params.smallOrderFee || 0;
        const commission = Math.round(subtotal * commissionRate * 100) / 100;
        const merchantAmount = Math.round((subtotal - commission) * 100) / 100;
        const platformFee = Math.round((commission + serviceFee + smallOrderFee) * 100) / 100;

        const payment = this.paymentRepo.create({
            orderId,
            userId,
            amount,
            currency,
            method,
            provider: method === PaymentMethodType.WALLET ? "wallet" : provider.name,
            providerRef: null,
            providerStatus: null,
            platformFee,
            driverAmount: merchantAmount, // reuse column for merchant earnings
            status: PaymentRecordStatus.PENDING,
            metadata: { reference },
        });
        const saved = await this.paymentRepo.save(payment);
        log.info("Order payment record created", { paymentId: saved.id, orderId, method, amount, currency });

        switch (method) {
            case PaymentMethodType.MOMO:
                return this.processMomoPayment(saved, reference, params, provider, currency);

            case PaymentMethodType.CARD:
                return this.processCardViaPaystack(saved, reference, params, provider, currency);

            case PaymentMethodType.WALLET:
                return this.processWalletPayment(saved, reference, userId, amount);

            case PaymentMethodType.CASH:
                return this.processCashPayment(saved, reference);

            default:
                throw new Error(`Unsupported payment method: ${method}`);
        }
    }

    // ── Service Booking Payments ─────────────────────────────────────

    /**
     * Process a service booking payment
     */
    async processServiceBookingPayment(params: {
        serviceBookingId: string;
        /** All booking ids covered by this single payment (multi-date bookings). */
        serviceBookingIds?: string[];
        userId: string;
        amount: number;
        method: PaymentMethodType;
        country?: string;
        email?: string;
        phoneNumber?: string;
    }): Promise<PaymentResult> {
        const { serviceBookingId, userId, amount, method } = params;
        const country = params.country || "GH";
        const { provider, currency } = await this.resolveCountryContext(country);

        // For service bookings, we use the specific serviceCommissionRate
        const settings = await this.settingsRepo.findOne({
            where: { country, isActive: true },
        });
        const commissionRate = settings
            ? Number(settings.serviceCommissionRate) / 100
            : 0.15; // default 15%

        const reference = `SRV-${uuidv4().slice(0, 12)}`;
        const platformFee = Math.round(amount * commissionRate * 100) / 100;
        const merchantAmount = Math.round(amount * (1 - commissionRate) * 100) / 100;

        const payment = this.paymentRepo.create({
            serviceBookingId,
            userId,
            amount,
            currency,
            method,
            provider: method === PaymentMethodType.WALLET ? "wallet" : provider.name,
            providerRef: null,
            providerStatus: null,
            platformFee,
            driverAmount: merchantAmount, // Use driverAmount column for merchant/provider earnings
            status: PaymentRecordStatus.PENDING,
            metadata: { reference, serviceBookingIds: params.serviceBookingIds || [serviceBookingId] },
        });
        const saved = await this.paymentRepo.save(payment);
        log.info("Service booking payment record created", { paymentId: saved.id, serviceBookingId, method, amount, currency });

        switch (method) {
            case PaymentMethodType.MOMO:
                return this.processMomoPayment(saved, reference, params, provider, currency);

            case PaymentMethodType.CARD:
                return this.processCardViaPaystack(saved, reference, params, provider, currency);

            case PaymentMethodType.WALLET:
                return this.processWalletPayment(saved, reference, userId, amount);

            default:
                // Services are prepaid: the provider blocks time for the booking.
                throw new Error("Service bookings must be paid by card or mobile money.");
        }
    }

    // ── Subscription Payments ───────────────────────────────────────

    /**
     * Process a service subscription payment
     */
    async processSubscriptionPayment(params: {
        subscriptionId: string;
        userId: string;
        amount: number;
        method: PaymentMethodType;
        country?: string;
        email?: string;
        phoneNumber?: string;
    }): Promise<PaymentResult> {
        const { subscriptionId, userId, amount, method } = params;
        const country = params.country || "GH";
        const { provider, currency } = await this.resolveCountryContext(country);

        const reference = `SUB-${uuidv4().slice(0, 12)}`;
        
        // No platform fee for subscriptions? we assume the entire 100 GHS is platform earnings
        const platformFee = amount;
        const driverAmount = 0;

        const payment = this.paymentRepo.create({
            subscriptionId,
            userId,
            amount,
            currency,
            method,
            provider: method === PaymentMethodType.WALLET ? "wallet" : provider.name,
            providerRef: null,
            providerStatus: null,
            platformFee,
            driverAmount,
            status: PaymentRecordStatus.PENDING,
            metadata: { reference },
        });
        const saved = await this.paymentRepo.save(payment);
        log.info("Subscription payment record created", { paymentId: saved.id, subscriptionId, method, amount, currency });

        switch (method) {
            case PaymentMethodType.MOMO:
                return this.processMomoPayment(saved, reference, params, provider, currency);

            case PaymentMethodType.CARD:
                return this.processCardViaPaystack(saved, reference, params, provider, currency);

            case PaymentMethodType.WALLET:
                return this.processWalletPayment(saved, reference, userId, amount);

            default:
                throw new Error(`Unsupported payment method: ${method}`);
        }
    }


    // ── Method-specific processors ──────────────────────────────────

    /**
     * Mobile money payment via provider
     */
    private async processMomoPayment(
        payment: Payment,
        reference: string,
        params: { email?: string; phoneNumber?: string; amount: number },
        provider: PaymentProvider,
        currency: string
    ): Promise<PaymentResult> {
        if (!params.phoneNumber) {
            throw new Error("Phone number is required for momo payment");
        }

        // Mobile money is Paystack-only. The Stripe implementation returned
        // success with NO authorization URL, silently creating unpayable records.
        provider = paymentProviderRegistry.getGatewayProvider();

        const charge = await this.prepareGatewayCharge(payment, provider, params.amount, currency);
        const result = await provider.initiateMomoPayment({
            amount: charge.amount,
            currency: charge.currency,
            email: params.email || `${params.phoneNumber}@velo.app`,
            phoneNumber: params.phoneNumber,
            reference,
            callbackUrl: PaymentService.callbackUrl(),
            metadata: {
                rideId: payment.rideId,
                orderId: payment.orderId,
                paymentId: payment.id,
            },
        });

        // Update payment record with provider info
        payment.providerRef = result.providerRef;
        payment.providerStatus = result.success ? "pending" : "failed";
        if (!result.success) {
            payment.status = PaymentRecordStatus.FAILED;
            log.warn("Momo payment initiation failed", { paymentId: payment.id });
            paymentEventsTotal.inc({ method: "momo", status: "failed" });
        } else {
            log.info("Momo payment initiated", { paymentId: payment.id, reference });
            paymentEventsTotal.inc({ method: "momo", status: "pending" });
        }
        await this.paymentRepo.save(payment);

        return {
            success: result.success,
            paymentId: payment.id,
            reference,
            status: payment.status,
            authorizationUrl: result.authorizationUrl,
            message: result.success
                ? "Momo payment initiated. Approve on your phone."
                : result.message || "Payment initiation failed. Please try again.",
        };
    }

    /**
     * Card (and redirect) payment via Paystack transaction initialize.
     * Returns an authorization URL the client opens to complete payment.
     * This replaces Stripe for card payments (Paystack-only).
     */
    private async processCardViaPaystack(
        payment: Payment,
        reference: string,
        params: { email?: string; phoneNumber?: string; amount: number },
        provider: PaymentProvider,
        currency: string
    ): Promise<PaymentResult> {
        // Cards always go through the gateway provider (Paystack): the
        // country-mapped provider may be Stripe, which has no card redirect flow,
        // and that threw "Card payments are not supported" for every non-African
        // customer. Currency is converted to the settlement currency below.
        provider = paymentProviderRegistry.getGatewayProvider();
        if (!provider.initiateCardPayment) {
            throw new Error("Card payments are temporarily unavailable. Please try mobile money or cash.");
        }
        const email = params.email
            || (params.phoneNumber ? `${params.phoneNumber}@velo.app` : "customer@velo.app");

        const charge = await this.prepareGatewayCharge(payment, provider, params.amount, currency);
        const result = await provider.initiateCardPayment({
            amount: charge.amount,
            currency: charge.currency,
            email,
            reference,
            callbackUrl: PaymentService.callbackUrl(),
            metadata: {
                rideId: payment.rideId,
                orderId: payment.orderId,
                paymentId: payment.id,
            },
        });

        payment.provider = provider.name;
        payment.providerRef = result.providerRef;
        payment.providerStatus = result.success ? "pending" : "failed";
        if (!result.success) {
            payment.status = PaymentRecordStatus.FAILED;
            log.warn("Card payment initiation failed", { paymentId: payment.id });
            paymentEventsTotal.inc({ method: "card", status: "failed" });
        } else {
            log.info("Card payment initiated via Paystack", { paymentId: payment.id, reference });
            paymentEventsTotal.inc({ method: "card", status: "pending" });
        }
        await this.paymentRepo.save(payment);

        return {
            success: result.success,
            paymentId: payment.id,
            reference,
            status: payment.status,
            authorizationUrl: result.authorizationUrl,
            message: result.success
                ? "Complete your payment in the page that opens."
                : result.message || "Payment initiation failed. Please try again.",
        };
    }

    /**
     * Card payment via Stripe PaymentIntent. (Deprecated: Paystack-only now.)
     * Kept for reference; no longer routed to.
     */
    private async processCardPayment(
        payment: Payment,
        reference: string,
        params: { amount: number; email?: string },
        currency: string
    ): Promise<PaymentResult> {
        const stripe = paymentProviderRegistry.getStripeProvider();

        const result = await stripe.createPaymentIntent({
            amount: params.amount,
            currency,
            metadata: {
                paymentId: payment.id,
                rideId: payment.rideId || undefined,
                orderId: payment.orderId || undefined,
                serviceBookingId: payment.serviceBookingId || undefined,
                subscriptionId: payment.subscriptionId || undefined,
                reference,
            },
        });

        payment.provider = "stripe";
        payment.providerRef = result.paymentIntentId || null;
        payment.providerStatus = result.success ? "requires_payment_method" : "failed";

        if (!result.success) {
            payment.status = PaymentRecordStatus.FAILED;
            log.warn("Card payment initiation failed", { paymentId: payment.id });
            paymentEventsTotal.inc({ method: "card", status: "failed" });
        } else {
            log.info("Card PaymentIntent created", { paymentId: payment.id, reference });
            paymentEventsTotal.inc({ method: "card", status: "pending" });
        }
        await this.paymentRepo.save(payment);

        return {
            success: result.success,
            paymentId: payment.id,
            reference,
            status: payment.status,
            clientSecret: result.clientSecret,
            message: result.success
                ? "Card payment ready. Complete payment on your device."
                : "Card payment setup failed. Please try again.",
        };
    }

    /**
     * Wallet payment - instant debit
     */
    private async processWalletPayment(
        payment: Payment,
        reference: string,
        userId: string,
        amount: number
    ): Promise<PaymentResult> {
        const hasBalance = await this.walletService.hasEnoughBalance(userId, amount);
        if (!hasBalance) {
            payment.status = PaymentRecordStatus.FAILED;
            payment.providerStatus = "insufficient_balance";
            await this.paymentRepo.save(payment);
            log.warn("Wallet payment failed - insufficient balance", { paymentId: payment.id });
            paymentEventsTotal.inc({ method: "wallet", status: "failed" });

            return {
                success: false,
                paymentId: payment.id,
                reference,
                status: PaymentRecordStatus.FAILED,
                message: "Insufficient wallet balance",
            };
        }

        // Debit customer wallet
        await this.walletService.debit(userId, amount, `Payment`, {
            rideId: payment.rideId,
            orderId: payment.orderId,
            paymentId: payment.id,
        });

        // Mark as successful
        payment.status = PaymentRecordStatus.SUCCESS;
        payment.providerStatus = "completed";
        payment.providerRef = reference;
        payment.completedAt = new Date();
        await this.paymentRepo.save(payment);
        await this.applyPaymentSideEffects(payment);

        log.info("Wallet payment successful", { paymentId: payment.id, amount });
        paymentEventsTotal.inc({ method: "wallet", status: "success" });

        return {
            success: true,
            paymentId: payment.id,
            reference,
            status: PaymentRecordStatus.SUCCESS,
            message: "Payment successful via wallet",
        };
    }

    /**
     * Cash payment - just mark as pending, driver/merchant collects later
     */
    private async processCashPayment(
        payment: Payment,
        reference: string
    ): Promise<PaymentResult> {
        payment.providerStatus = "cash_on_delivery";
        payment.providerRef = reference;
        await this.paymentRepo.save(payment);
        log.info("Cash payment registered", { paymentId: payment.id });
        paymentEventsTotal.inc({ method: "cash", status: "success" });

        return {
            success: true,
            paymentId: payment.id,
            reference,
            status: PaymentRecordStatus.PENDING,
            message: "Cash payment - pay after service",
        };
    }

    // ── Webhooks & Verification ─────────────────────────────────────

    /** Public browser-return URL Paystack redirects to after checkout. */
    static callbackUrl(): string {
        const base = process.env.PUBLIC_BASE_URL || "https://api.velocouriersvc.com";
        return `${base}/api/v1/payments/callback`;
    }

    /** Find a payment by the reference stored in its metadata. */
    async getPaymentByReference(reference: string): Promise<Payment | null> {
        return this.paymentRepo
            .createQueryBuilder("payment")
            .where(`payment.metadata ->> 'reference' = :ref`, { ref: reference })
            .getOne();
    }

    /**
     * Advance the entity a successful payment belongs to. The webhook and the
     * browser callback can both land, so every branch re-checks state first.
     * Uses direct repos (importing ride-service here would create a cycle).
     */
    private async applyPaymentSideEffects(payment: Payment): Promise<void> {
        try {
            if (payment.rideId) {
                const ride = await this.rideRepo.findOne({ where: { id: payment.rideId } });
                if (ride && ride.paymentStatus !== RidePaymentStatus.PAID) {
                    ride.paymentStatus = RidePaymentStatus.PAID;
                    if (ride.status === RideStatus.AWAITING_PAYMENT) ride.status = RideStatus.PAID;
                    ride.paidAt = new Date();
                    await this.rideRepo.save(ride);
                    if (ride.driverId) {
                        await this.notificationService.notifyPaymentReceived(
                            ride.driverId, Number(ride.finalFare), ride.id
                        );
                    } else {
                        // Prepaid ride: drivers were held back until the money was in.
                        const { RideService } = require("../ride-service");
                        await new RideService().dispatchRide(ride.id).catch((e: Error) =>
                            log.warn("Ride dispatch after payment failed", { rideId: ride.id, error: e.message })
                        );
                    }
                    log.info("Ride advanced to PAID from payment confirmation", { rideId: ride.id });
                }
            }
            // Service bookings: one payment can cover several bookings (multi-date).
            const bookingIds: string[] = Array.isArray((payment.metadata as any)?.serviceBookingIds)
                ? (payment.metadata as any).serviceBookingIds
                : (payment.serviceBookingId ? [payment.serviceBookingId] : []);
            if (bookingIds.length) {
                const { ServiceBooking, ServicePaymentStatus } = require("../../models/service-booking");
                const bookingRepo = AppDataSource.getRepository(ServiceBooking);
                for (const id of bookingIds) {
                    const updated = await bookingRepo.update(
                        { id, paymentStatus: ServicePaymentStatus.PENDING },
                        { paymentStatus: ServicePaymentStatus.PAID }
                    );
                    if (updated.affected) log.info("Service booking marked paid", { bookingId: id });
                }
            }
            if (payment.orderId) {
                const order = await this.orderRepo.findOne({ where: { id: payment.orderId } });
                if (order && order.paymentStatus !== OrderPaymentStatus.PAID) {
                    order.paymentStatus = OrderPaymentStatus.PAID;
                    await this.orderRepo.save(order);
                    await this.notificationService.notify(
                        payment.userId,
                        NotificationType.SYSTEM,
                        "Payment Confirmed",
                        `Your payment of ${formatCurrency(Number(payment.amount), payment.currency || "GHS")} was received.`,
                        { orderId: order.id, paymentId: payment.id }
                    );
                    // Online orders are AWAITING_PAYMENT until now: this flips them to
                    // PENDING, notifies the merchant + customer, and releases the
                    // pickup/delivery codes (only once the money is in). Idempotent.
                    const { OrderService } = require("../order-service");
                    await new OrderService().applyOrderPaidSideEffects(order.id).catch((e: Error) =>
                        log.warn("Order paid side effects failed", { orderId: order.id, error: e.message })
                    );
                    log.info("Order advanced to PAID from payment confirmation", { orderId: order.id });
                }
            }
        } catch (err) {
            log.error("Payment side effects failed", { paymentId: payment.id, error: (err as Error).message });
        }
    }

    /**
     * Handle webhook from payment provider (Paystack)
     */
    async handleWebhook(payload: string, signature: string, country?: string): Promise<void> {
        const provider = paymentProviderRegistry.getProvider(country || "GH");
        const isValid = provider.verifyWebhookSignature(payload, signature);
        if (!isValid) {
            log.warn("Invalid webhook signature received");
            throw new Error("Invalid webhook signature");
        }

        const event = JSON.parse(payload);
        log.info("Webhook received", { event: event.event });

        if (event.event === "charge.success") {
            const reference = event.data.reference;
            await this.confirmPayment(reference, country);
        }
    }

    /**
     * Handle Stripe webhook events (payment_intent.succeeded, etc.)
     */
    async handleStripeWebhook(payload: string, signature: string): Promise<void> {
        const stripe = paymentProviderRegistry.getStripeProvider();
        const isValid = stripe.verifyWebhookSignature(payload, signature);
        if (!isValid) {
            log.warn("Invalid Stripe webhook signature");
            throw new Error("Invalid Stripe webhook signature");
        }

        const event = JSON.parse(payload);
        log.info("Stripe webhook received", { type: event.type });

        switch (event.type) {
            case "payment_intent.succeeded": {
                const pi = event.data.object;
                const paymentId = pi.metadata?.paymentId;
                if (paymentId) {
                    const payment = await this.paymentRepo.findOne({ where: { id: paymentId } });
                    if (payment && payment.status !== PaymentRecordStatus.SUCCESS) {
                        payment.status = PaymentRecordStatus.SUCCESS;
                        payment.providerStatus = "succeeded";
                        payment.providerRef = pi.id;
                        payment.completedAt = new Date();
                        await this.paymentRepo.save(payment);

                        // Side Effects: Subscriptions
                        if (payment.subscriptionId) {
                            await this.activateSubscription(payment.subscriptionId, payment.userId);
                        }
                        await this.applyPaymentSideEffects(payment);

                        log.info("Stripe payment confirmed via webhook", { paymentId });
                        paymentEventsTotal.inc({ method: "card", status: "success" });
                    }
                }
                break;
            }
            case "payment_intent.payment_failed": {
                const pi = event.data.object;
                const paymentId = pi.metadata?.paymentId;
                if (paymentId) {
                    const payment = await this.paymentRepo.findOne({ where: { id: paymentId } });
                    if (payment) {
                        payment.status = PaymentRecordStatus.FAILED;
                        payment.providerStatus = pi.last_payment_error?.message || "failed";
                        await this.paymentRepo.save(payment);

                        await this.notificationService.notify(
                            payment.userId,
                            NotificationType.PAYMENT_FAILED,
                            "Payment Failed",
                            `Your card payment of ${formatCurrency(Number(payment.amount), payment.currency || "USD")} could not be processed.`,
                            { paymentId: payment.id }
                        );

                        log.warn("Stripe payment failed via webhook", { paymentId });
                        paymentEventsTotal.inc({ method: "card", status: "failed" });
                    }
                }
                break;
            }
        }
    }

    /**
     * Confirm a pending payment (called by webhook or manual verification)
     */
    async confirmPayment(reference: string, country?: string): Promise<Payment | null> {
        const provider = paymentProviderRegistry.getProvider(country || "GH");

        const payment = await this.getPaymentByReference(reference);
        if (!payment) return null;
        // Already settled (webhook and callback can both fire) - nothing to redo.
        if (payment.status !== PaymentRecordStatus.PENDING) return payment;

        // Verify with provider
        const verification = await provider.verifyPayment(reference);

        if (verification.success) {
            payment.status = PaymentRecordStatus.SUCCESS;
            payment.providerStatus = verification.providerStatus;
            payment.providerRef = verification.providerRef;
            payment.completedAt = new Date();
            
            // Side Effects: Subscriptions
            if (payment.subscriptionId) {
                await this.activateSubscription(payment.subscriptionId, payment.userId);
            }

            // Side Effects: Scheduled ride prepaid
            if (payment.scheduledRideId) {
                await this.markScheduledRidePaid(payment.scheduledRideId);
            }

            // Side Effects: advance the ride/order this payment pays for
            await this.applyPaymentSideEffects(payment);

            log.info("Payment confirmed", { paymentId: payment.id, reference });
            paymentEventsTotal.inc({ method: "momo", status: "success" });
        } else {
            payment.status = PaymentRecordStatus.FAILED;
            payment.providerStatus = verification.providerStatus;

            // Notify user about payment failure
            await this.notificationService.notify(
                payment.userId,
                NotificationType.PAYMENT_FAILED,
                "Payment Failed",
                `Your payment of ${formatCurrency(Number(payment.amount), payment.currency || "GHS")} could not be processed. Please try again.`,
                { paymentId: payment.id, reference }
            );

            log.warn("Payment verification failed", { paymentId: payment.id, reference });
        }

        return this.paymentRepo.save(payment);
    }

    // ── Earnings ────────────────────────────────────────────────────

    /**
     * Credit driver earnings after a completed ride.
     * Reads commission from platform_settings instead of hardcoded constants.
     */
    async creditDriverEarnings(
        driverId: string,
        rideId: string,
        totalFare: number,
        country?: string
    ): Promise<void> {
        const { commissionRate } = await this.resolveCountryContext(country || "GH");
        const driverShare = 1 - commissionRate;
        const driverAmount = Math.round(totalFare * driverShare * 100) / 100;

        await this.walletService.credit(driverId, driverAmount, "Ride earnings", {
            rideId,
            totalFare,
            driverShare,
            platformCommission: commissionRate,
        });
    }

    /**
     * Mark cash payment as collected by driver
     */
    async confirmCashPayment(rideId: string): Promise<Payment | null> {
        const payment = await this.paymentRepo.findOne({
            where: { rideId, method: PaymentMethodType.CASH },
        });

        if (!payment) return null;

        payment.status = PaymentRecordStatus.SUCCESS;
        payment.providerStatus = "cash_collected";
        payment.completedAt = new Date();

        return this.paymentRepo.save(payment);
    }

    // ── Queries ─────────────────────────────────────────────────────

    /**
     * Get payment by ride ID
     */
    async getPaymentByRideId(rideId: string): Promise<Payment | null> {
        return this.paymentRepo.findOne({ where: { rideId } });
    }

    /**
     * Get payment history for a user
     */
    async getUserPayments(
        userId: string,
        limit: number = 20,
        offset: number = 0
    ): Promise<{ payments: Payment[]; total: number }> {
        const [payments, total] = await this.paymentRepo.findAndCount({
            where: { userId },
            order: { createdAt: "DESC" },
            take: limit,
            skip: offset,
        });

        return { payments, total };
    }

    /**
     * Activate a service subscription after successful payment
     */
    private async activateSubscription(subscriptionId: string, userId: string): Promise<void> {
        try {
            await AppDataSource.transaction(async (manager) => {
                // 1. Update subscription status
                await manager.getRepository(ServiceSubscription).update(
                    { id: subscriptionId },
                    { 
                        status: ServiceSubscriptionStatus.ACTIVE,
                        currentPeriodStart: new Date(),
                        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
                    }
                );

                // 2. Grant access on buyer profile
                await manager.getRepository(BuyerProfile).update(
                    { userId },
                    { hasServicesAccess: true }
                );
            });

            // 3. Notify user about subscription activation
            await this.notificationService.notify(
                userId,
                NotificationType.SUBSCRIPTION_ACTIVATED,
                "Subscription Activated! 🎉",
                "Your Velo Services subscription is now active. You can browse and book services for the next 30 days.",
                { subscriptionId }
            );

            log.info("Subscription activated and access granted", { subscriptionId, userId });
        } catch (error) {
            log.error("Failed to activate subscription side-effects", { 
                subscriptionId, 
                userId, 
                error: (error as Error).message 
            });
        }
    }
}
