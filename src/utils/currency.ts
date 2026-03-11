/**
 * Currency helpers — symbol map and formatting utility
 */

const CURRENCY_SYMBOLS: Record<string, string> = {
    GHS: "GH₵",
    NGN: "₦",
    USD: "$",
    CAD: "C$",
    INR: "₹",
    EUR: "€",
    GBP: "£",
    KES: "KSh",
    ZAR: "R",
};

/**
 * Format an amount with the correct currency symbol.
 *
 * @example formatCurrency(45.5, "GHS")  → "GH₵ 45.50"
 * @example formatCurrency(1500, "NGN")  → "₦ 1,500.00"
 */
export function formatCurrency(amount: number, currencyCode: string): string {
    const symbol = CURRENCY_SYMBOLS[currencyCode] || currencyCode;
    const formatted = amount.toLocaleString("en", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });
    return `${symbol} ${formatted}`;
}

/**
 * Get the currency symbol for a given code.
 */
export function getCurrencySymbol(currencyCode: string): string {
    return CURRENCY_SYMBOLS[currencyCode] || currencyCode;
}

/**
 * Map a country code to its default currency.
 * Kept here as a quick fallback — the canonical source is `platform_settings`.
 */
const COUNTRY_CURRENCY: Record<string, string> = {
    GH: "GHS",
    NG: "NGN",
    US: "USD",
    CA: "CAD",
    IN: "INR",
    GB: "GBP",
    KE: "KES",
    ZA: "ZAR",
};

export function currencyForCountry(countryCode: string): string {
    return COUNTRY_CURRENCY[countryCode] || "USD";
}
