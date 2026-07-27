/**
 * Paystack transfer (payout) fee. The recipient receives (gross - fee); the user's
 * wallet is debited the gross; Paystack charges the fee from our balance, so the
 * platform stays net-neutral. Defaults follow Paystack's published tiers and are
 * env-overridable (fees change and differ by market).
 */
export function paystackTransferFee(amount: number, currency: string): number {
    const cur = (currency || "NGN").toUpperCase();
    if (cur === "NGN") {
        if (amount <= 5000) return Number(process.env.PAYSTACK_NGN_FEE_TIER1 || 10);
        if (amount <= 50000) return Number(process.env.PAYSTACK_NGN_FEE_TIER2 || 25);
        return Number(process.env.PAYSTACK_NGN_FEE_TIER3 || 50);
    }
    if (cur === "GHS") {
        const pct = Number(process.env.PAYSTACK_GHS_FEE_PCT || 1) / 100;
        const cap = Number(process.env.PAYSTACK_GHS_FEE_CAP || 10);
        const min = Number(process.env.PAYSTACK_GHS_FEE_MIN || 0.5);
        return Math.min(Math.max(Math.round(amount * pct * 100) / 100, min), cap);
    }
    return Number(process.env.PAYOUT_DEFAULT_FEE || 10);
}

/** Gross requested, the fee, and the net amount actually sent to the bank/wallet. */
export function payoutBreakdown(gross: number, currency: string): { gross: number; fee: number; net: number; currency: string } {
    const fee = paystackTransferFee(gross, currency);
    const net = Math.round((gross - fee) * 100) / 100;
    return { gross, fee, net, currency: (currency || "NGN").toUpperCase() };
}
