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
    private stripe: Stripe;
    private webhookSecret: string;

    constructor() {
        const secretKey = process.env.STRIPE_SECRET_KEY || "";
        this.webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || "";

        if (!secretKey) {
            log.warn("STRIPE_SECRET_KEY not set");
        }

        this.stripe = new Stripe(secretKey, {
            apiVersion: "2025-04-30.basil" as any,
        });
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
