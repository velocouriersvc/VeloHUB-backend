/**
 * Currency helpers - symbol map and formatting utility
 */

const CURRENCY_SYMBOLS: Record<string, string> = {
    GHS: "GH₵", NGN: "₦",  KES: "KSh", ZAR: "R",
    TZS: "TSh",  UGX: "USh",
    USD: "$",    CAD: "C$", AUD: "A$",
    GBP: "£",    EUR: "€",  INR: "₹",
    // EU non-euro members
    BGN: "лв",  CZK: "Kč", DKK: "kr", HUF: "Ft",
    PLN: "zł",  RON: "lei", SEK: "kr",
};

/**
 * Payment processing fee the customer pays on a gateway (card/momo) charge:
 * base * rate% + fixed, rounded to 2dp. Used to keep the displayed total equal
 * to the amount charged. Returns 0 when no rate/fixed is configured.
 */
export function processingFeeFor(base: number, rate?: number | null, fixed?: number | null): number {
    const feeRate = Number(rate) || 0;
    const feeFixed = Number(fixed) || 0;
    if (feeRate <= 0 && feeFixed <= 0) return 0;
    return Math.round((Number(base) * (feeRate / 100) + feeFixed) * 100) / 100;
}

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
 * Kept here as a quick fallback - the canonical source is `platform_settings`.
 */
const COUNTRY_CURRENCY: Record<string, string> = {
    GH: "GHS", NG: "NGN", KE: "KES", ZA: "ZAR",
    TZ: "TZS", UG: "UGX",
    US: "USD",  CA: "CAD", AU: "AUD",
    GB: "GBP",  IN: "INR",
    // EU - euro members
    AT: "EUR", BE: "EUR", CY: "EUR", EE: "EUR",
    FI: "EUR", FR: "EUR", DE: "EUR", GR: "EUR",
    HR: "EUR", IE: "EUR", IT: "EUR", LV: "EUR",
    LT: "EUR", LU: "EUR", MT: "EUR", NL: "EUR",
    PT: "EUR", SK: "EUR", SI: "EUR", ES: "EUR",
    // EU - non-euro members
    BG: "BGN", CZ: "CZK", DK: "DKK",
    HU: "HUF", PL: "PLN", RO: "RON", SE: "SEK",
};

export function currencyForCountry(countryCode: string): string {
    return COUNTRY_CURRENCY[countryCode] || "USD";
}


