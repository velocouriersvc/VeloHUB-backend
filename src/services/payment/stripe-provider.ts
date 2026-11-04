import Stripe from "stripe";
import crypto from "crypto";
import {
    PaymentProvider,
    MomoPaymentRequest,
    PaymentVerification,
} from "./payment-provider.interface";
import { createServiceLogger } from "../../utils/logger";
import { currencyConversionService } from "../currency-conversion-service";

const log = createServiceLogger("StripeProvider");

export class StripeProvider implements PaymentProvider {
    name = "stripe";
    private _stripe: Stripe | null = null;
    private secretKey: string;
    private webhookSecret: string;

    constructor() {
        this.secretKey = process.env.STRIPE_SECRET_KEY || "";
        this.webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || "";

        if (!this.secretKey) {
            log.warn("STRIPE_SECRET_KEY not set");
        }
    }

    /**
     * Built on first use, not in the constructor. The Stripe SDK throws on an empty
     * key, and the provider registry instantiates every provider at import time, so
     * constructing it eagerly made merely IMPORTING anything that reaches
     * payment-service fail wherever Stripe is unconfigured. Paystack already behaves
     * this way (warn, carry on).
     */
    private get stripe(): Stripe {
        if (!this._stripe) {
            this._stripe = new Stripe(this.secretKey, {
                apiVersion: "2025-04-30.basil" as any,
            });
        }
        return this._stripe;
    }

    // ── Payment Intent (Stripe's primary card flow) ──────────────────

    /**
     * Create a Stripe PaymentIntent. This is the main entry point for
     * card payments - the client uses the returned clientSecret to confirm
     * with the Stripe Payment Sheet or Elements.
     */
    async createPaymentIntent(params: {
        amount: number; // in major currency unit (e.g. 5.00 USD)
        currency: string;
        metadata?: Record<string, any>;
    }): Promise<{
        success: boolean;
        clientSecret: string;
        paymentIntentId: string;
        ephemeralKey?: string;
        customerId?: string;
    }> {
        try {
            let finalAmount = params.amount;
            let finalCurrency = params.currency.toUpperCase();
            let conversionMetadata: Record<string, any> = {};

            // Check if currency is supported by Stripe for US accounts
            if (!currencyConversionService.isStripeSupportedCurrency(params.currency)) {
                log.info("Currency not supported by Stripe, converting to USD", {
                    originalCurrency: params.currency,
                    originalAmount: params.amount,
                });

                // Convert to USD using live exchange rates
                const conversion = await currencyConversionService.convertCurrency(
                    params.amount,
                    params.currency,
                    'USD'
                );
                finalAmount = conversion.amount;
                finalCurrency = 'USD';
                
                // Store conversion details in metadata
                conversionMetadata = {
                    originalAmount: conversion.originalAmount,
                    originalCurrency: conversion.originalCurrency,
                    conversionRate: conversion.rate,
                    convertedAmount: conversion.amount,
                    convertedCurrency: conversion.currency,
                    conversionTimestamp: conversion.timestamp,
                };

                log.info("Currency converted for Stripe using live rates", {
                    from: `${conversion.originalAmount} ${conversion.originalCurrency}`,
                    to: `${conversion.amount} ${conversion.currency}`,
                    rate: conversion.rate,
                });
            }

            // Stripe expects amounts in the smallest currency unit (cents)
            const amountInCents = Math.round(finalAmount * 100);

            const paymentIntent = await this.stripe.paymentIntents.create({
                amount: amountInCents,
                currency: finalCurrency.toLowerCase(),
                automatic_payment_methods: { enabled: true },
                metadata: {
                    ...params.metadata,
                    ...conversionMetadata,
                },
            });

            log.info("PaymentIntent created", {
                id: paymentIntent.id,
                amount: amountInCents,
                currency: finalCurrency,
                originalCurrency: params.currency,
            });

            return {
                success: true,
                clientSecret: paymentIntent.client_secret!,
                paymentIntentId: paymentIntent.id,
            };
        } catch (error) {
            log.error("Failed to create PaymentIntent", {
                error: (error as Error).message,
            });
            return {
                success: false,
                clientSecret: "",
                paymentIntentId: "",
            };
        }
    }

    /**
     * Retrieve and check the status of a PaymentIntent.
     */
    async verifyPaymentIntent(paymentIntentId: string): Promise<PaymentVerification> {
        try {
            const pi = await this.stripe.paymentIntents.retrieve(paymentIntentId);

            return {
                success: pi.status === "succeeded",
                reference: pi.id,
                providerRef: pi.id,
                providerStatus: pi.status,
                amount: pi.amount / 100,
                currency: pi.currency.toUpperCase(),
                metadata: pi.metadata as Record<string, any>,
            };
        } catch (error) {
            log.error("Failed to verify PaymentIntent", {
                paymentIntentId,
                error: (error as Error).message,
            });
            return {
                success: false,
                reference: paymentIntentId,
                providerRef: "",
                providerStatus: "failed",
                amount: 0,
                currency: "USD",
            };
        }
    }

    // ── PaymentProvider interface (for compatibility) ────────────────

    /**
     * Stripe doesn't do mobile money directly, but we implement the interface
     * to stay compatible with the provider registry. For card payments the
     * frontend uses PaymentIntent + Payment Sheet instead.
     */
    async initiateMomoPayment(request: MomoPaymentRequest): Promise<{
        success: boolean;
        reference: string;
        providerRef: string;
        authorizationUrl?: string;
    }> {
        // For Stripe, card payments go through PaymentIntent flow, not this method.
        // If someone calls this, create a PaymentIntent and return the client secret URL.
        const result = await this.createPaymentIntent({
            amount: request.amount,
            currency: request.currency,
            metadata: {
                ...request.metadata,
                email: request.email,
                phoneNumber: request.phoneNumber,
                reference: request.reference,
            },
        });

        return {
            success: result.success,
            reference: request.reference,
            providerRef: result.paymentIntentId,
            authorizationUrl: undefined, // Stripe uses client-side confirmation
        };
    }

    /**
     * Verify a payment by reference (PaymentIntent ID or charge reference)
     */
    async verifyPayment(reference: string): Promise<PaymentVerification> {
        // Reference could be a PaymentIntent ID (pi_xxx) or a charge ID
        if (reference.startsWith("pi_")) {
            return this.verifyPaymentIntent(reference);
        }

        // Try to find by metadata or list recent charges
        try {
            const charges = await this.stripe.charges.search({
                query: `metadata["reference"]:"${reference}"`,
                limit: 1,
            });

            if (charges.data.length > 0) {
                const charge = charges.data[0];
                return {
                    success: charge.status === "succeeded",
                    reference,
                    providerRef: charge.id,
                    providerStatus: charge.status,
                    amount: charge.amount / 100,
                    currency: charge.currency.toUpperCase(),
                    metadata: charge.metadata as Record<string, any>,
                };
            }
        } catch (error) {
            log.error("Stripe charge search error", {
                reference,
                error: (error as Error).message,
            });
        }

        return {
            success: false,
            reference,
            providerRef: "",
            providerStatus: "not_found",
            amount: 0,
            currency: "USD",
        };
    }

    // ── Stripe Connect payouts ──────────────────────────────────────
    // Paystack Transfers only reach a handful of African markets, so everyone
    // else is paid through Stripe Connect. An Express connected account holds
    // the recipient's bank details; Stripe collects and verifies them through
    // its own hosted onboarding, which is also why a plain bank-number form
    // could never have worked for these users.

    /** Create an Express connected account for a payout recipient. */
    async createConnectAccount(params: {
        email?: string | null;
        country: string;
        userId: string;
        businessType?: "individual" | "company";
    }): Promise<{ success: boolean; accountId?: string; message?: string }> {
        try {
            const account = await this.stripe.accounts.create({
                type: "express",
                country: params.country.toUpperCase(),
                email: params.email || undefined,
                business_type: params.businessType || "individual",
                capabilities: { transfers: { requested: true } },
                metadata: { userId: params.userId },
            });
            return { success: true, accountId: account.id };
        } catch (error) {
            log.error("Stripe createConnectAccount failed", {
                userId: params.userId,
                country: params.country,
                error: (error as Error).message,
            });
            return { success: false, message: (error as Error).message };
        }
    }

    /** Hosted onboarding link where the user adds their bank and identity. */
    async createAccountLink(params: {
        accountId: string;
        refreshUrl: string;
        returnUrl: string;
    }): Promise<{ success: boolean; url?: string; message?: string }> {
        try {
            const link = await this.stripe.accountLinks.create({
                account: params.accountId,
                refresh_url: params.refreshUrl,
                return_url: params.returnUrl,
                type: "account_onboarding",
            });
            return { success: true, url: link.url };
        } catch (error) {
            log.error("Stripe createAccountLink failed", {
                accountId: params.accountId,
                error: (error as Error).message,
            });
            return { success: false, message: (error as Error).message };
        }
    }

    /** Onboarding / capability state of a connected account. */
    async getConnectAccount(accountId: string): Promise<{
        success: boolean;
        payoutsEnabled?: boolean;
        detailsSubmitted?: boolean;
        requirementsDue?: string[];
        bankLast4?: string | null;
        message?: string;
    }> {
        try {
            const a = await this.stripe.accounts.retrieve(accountId);
            const ext: any = (a as any).external_accounts?.data?.[0];
            return {
                success: true,
                payoutsEnabled: !!a.payouts_enabled,
                detailsSubmitted: !!a.details_submitted,
                requirementsDue: a.requirements?.currently_due || [],
                bankLast4: ext?.last4 || null,
            };
        } catch (error) {
            log.error("Stripe getConnectAccount failed", {
                accountId,
                error: (error as Error).message,
            });
            return { success: false, message: (error as Error).message };
        }
    }

    /**
     * Move funds to a connected account. Stripe then pays it out to the bank
     * on the account's own payout schedule.
     */
    async transferToConnectedAccount(params: {
        accountId: string;
        amount: number; // major units
        currency: string;
        reference: string;
        description?: string;
    }): Promise<{ success: boolean; transferId?: string; message?: string }> {
        try {
            const transfer = await this.stripe.transfers.create(
                {
                    amount: Math.round(params.amount * 100),
                    currency: params.currency.toLowerCase(),
                    destination: params.accountId,
                    description: params.description || `Payout ${params.reference}`,
                    metadata: { reference: params.reference },
                },
                { idempotencyKey: params.reference },
            );
            return { success: true, transferId: transfer.id };
        } catch (error) {
            log.error("Stripe transferToConnectedAccount failed", {
                accountId: params.accountId,
                reference: params.reference,
                error: (error as Error).message,
            });
            return { success: false, message: (error as Error).message };
        }
    }

    /**
     * Verify Stripe webhook signature
     */
    verifyWebhookSignature(payload: string, signature: string): boolean {
        try {
            this.stripe.webhooks.constructEvent(
                payload,
                signature,
                this.webhookSecret
            );
            return true;
        } catch (error) {
            log.warn("Invalid Stripe webhook signature", {
                error: (error as Error).message,
            });
            return false;
        }
    }
}
