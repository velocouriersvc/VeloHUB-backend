import { PaymentProvider } from "./payment-provider.interface";
import { PaystackProvider } from "./paystack-provider";
import { StripeProvider } from "./stripe-provider";
import { createServiceLogger } from "../../utils/logger";

const log = createServiceLogger("PaymentProviderRegistry");

/**
 * Registry that maps countries to payment providers.
 *
 * Paystack handles GH & NG (mobile money + cards).
 * Stripe handles US, CA, GB, and EU countries (card payments).
 */
export class PaymentProviderRegistry {
    private providers: Map<string, PaymentProvider> = new Map();
    private defaultProvider: PaymentProvider;
    private stripeProvider: StripeProvider;

    constructor() {
        const paystack = new PaystackProvider();
        this.stripeProvider = new StripeProvider();
        this.defaultProvider = paystack;

        // Ghana & Nigeria - Paystack
        this.providers.set("GH", paystack);
        this.providers.set("NG", paystack);

        // North America & Europe - Stripe
        const stripeCountries = [
            "US", "CA", "GB", "IE", "FR", "DE", "NL", "BE",
            "AT", "CH", "ES", "IT", "PT", "SE", "DK", "NO",
            "FI", "AU", "NZ", "SG", "JP",
        ];
        for (const code of stripeCountries) {
            this.providers.set(code, this.stripeProvider);
        }

        log.info("Payment provider registry initialised", {
            countries: Array.from(this.providers.keys()),
        });
    }

    /**
     * Resolve the payment provider for a country.
     * Falls back to the default (Paystack) if no country-specific mapping exists.
     */
    getProvider(country: string): PaymentProvider {
        return this.providers.get(country) || this.defaultProvider;
    }

    /**
     * Register (or override) a provider for a specific country.
     */
    registerProvider(country: string, provider: PaymentProvider): void {
        this.providers.set(country, provider);
        log.info("Provider registered", { country, provider: provider.name });
    }

    /**
     * List all registered country → provider mappings.
     */
    listProviders(): Record<string, string> {
        const result: Record<string, string> = {};
        this.providers.forEach((provider, country) => {
            result[country] = provider.name;
        });
        return result;
    }

    /**
     * Get the Stripe provider instance directly.
     * Used when the frontend requests a PaymentIntent for card payments.
     */
    getStripeProvider(): StripeProvider {
        return this.stripeProvider;
    }
}

/** Singleton instance - import this everywhere */
export const paymentProviderRegistry = new PaymentProviderRegistry();
