/**
 * Which rail pays a user out.
 *
 * Paystack Transfers only reach bank accounts in the African markets Paystack
 * actually operates in. Everyone else was still being shown the Paystack bank
 * picker, which is why a US user opened a ticket asking "What is pay stack?
 * how do I add my bank to the payout system it won't allow me to" - the bank
 * codes it offers simply do not exist outside those markets.
 *
 * Non-Paystack countries are paid through Stripe Connect instead, which is the
 * same processor those users already pay with.
 */
export type PayoutRail = "paystack" | "stripe";

/**
 * Countries where Paystack can actually settle a transfer to a local bank or
 * mobile money wallet. Keep this list to markets Paystack supports for
 * PAYOUTS, which is narrower than the set it can accept payments from.
 */
export const PAYSTACK_PAYOUT_COUNTRIES = ["NG", "GH", "ZA", "KE", "CI", "EG"] as const;

/** Local currency per Paystack payout market, used to list the right banks. */
export const PAYSTACK_PAYOUT_CURRENCIES: Record<string, string> = {
    NG: "NGN",
    GH: "GHS",
    ZA: "ZAR",
    KE: "KES",
    CI: "XOF",
    EG: "EGP",
};

export function isPaystackPayoutCountry(country?: string | null): boolean {
    if (!country) return false;
    return (PAYSTACK_PAYOUT_COUNTRIES as readonly string[]).includes(country.toUpperCase());
}

/**
 * The rail for a user's country. Unknown country falls back to Stripe, which
 * is the worldwide option: showing a bank picker that cannot work is worse
 * than showing hosted onboarding that can.
 */
export function payoutRailFor(country?: string | null): PayoutRail {
    return isPaystackPayoutCountry(country) ? "paystack" : "stripe";
}
