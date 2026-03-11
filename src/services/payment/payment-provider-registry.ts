import { PaymentProvider } from "./payment-provider.interface";
import { PaystackProvider } from "./paystack-provider";
import { createServiceLogger } from "../../utils/logger";

const log = createServiceLogger("PaymentProviderRegistry");

/**
 * Registry that maps countries to payment providers.
 *
 * Currently every country routes through Paystack — when a new provider
 * (Flutterwave, Stripe, Razorpay …) is added, register it here by
 * country code and the rest of the stack resolves automatically.
 */
export class PaymentProviderRegistry {
    private providers: Map<string, PaymentProvider> = new Map();
    private defaultProvider: PaymentProvider;

    constructor() {
        const paystack = new PaystackProvider();
        this.defaultProvider = paystack;

        // Ghana & Nigeria — Paystack
        this.providers.set("GH", paystack);
        this.providers.set("NG", paystack);

        // TODO: US/CA/IN — add Stripe / Razorpay when ready
        // this.providers.set("US", new StripeProvider());
        // this.providers.set("IN", new RazorpayProvider());

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
}

/** Singleton instance — import this everywhere */
export const paymentProviderRegistry = new PaymentProviderRegistry();
