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
/**
 * ISO 3166-1 alpha-2 codes for the whole African continent. Exported because
 * cash and mobile money are only offered in these markets.
 */
export const AFRICAN_COUNTRIES = [
    "DZ", "AO", "BJ", "BW", "BF", "BI", "CM", "CV", "CF", "TD", "KM", "CG",
    "CD", "CI", "DJ", "EG", "GQ", "ER", "SZ", "ET", "GA", "GM", "GH", "GN",
    "GW", "KE", "LS", "LR", "LY", "MG", "MW", "ML", "MR", "MU", "MA", "MZ",
    "NA", "NE", "NG", "RW", "ST", "SN", "SC", "SL", "SO", "ZA", "SS", "SD",
    "TZ", "TG", "TN", "UG", "ZM", "ZW",
];

/** Cash and mobile money are only settled in the African markets Velo operates. */
export function isAfricanCountry(country?: string | null): boolean {
    return !!country && AFRICAN_COUNTRIES.includes(country.toUpperCase());
}

export class PaymentProviderRegistry {
    private providers: Map<string, PaymentProvider> = new Map();
    private defaultProvider: PaymentProvider;
    private stripeProvider: StripeProvider;
    private paystackProvider: PaystackProvider;

    constructor() {
        const paystack = new PaystackProvider();
        this.paystackProvider = paystack;
        this.stripeProvider = new StripeProvider();
        // Global default is Stripe (worldwide card support). Paystack stays mapped to the
        // specific African markets it supports (mobile money + cards) below.
        this.defaultProvider = this.stripeProvider;

        // African countries route to Paystack (mobile money + cards); everywhere else
        // falls through to the Stripe default.
        for (const code of AFRICAN_COUNTRIES) {
            this.providers.set(code, paystack);
        }

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

    /**
     * Provider used for CARD and MOBILE MONEY charges everywhere. Paystack is the
     * only live gateway that implements both (Stripe has no initiateCardPayment,
     * which is why non-African customers hit "Card payments are not supported by
     * the active provider"). Charges settle via the currency conversion in
     * PaymentService.gatewayCharge.
     */
    getGatewayProvider(): PaymentProvider {
        return this.paystackProvider;
    }
}

/** Singleton instance - import this everywhere */
export const paymentProviderRegistry = new PaymentProviderRegistry();
