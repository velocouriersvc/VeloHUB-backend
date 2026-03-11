// ═══════════════════════════════════════════════════════════════════
//  WALLET – Request DTOs
// ═══════════════════════════════════════════════════════════════════

/** POST /wallet/fund  (example) */
export interface FundWalletBody {
    amount: number;
    phoneNumber?: string;
}

// ═══════════════════════════════════════════════════════════════════
//  WALLET – Response DTOs
// ═══════════════════════════════════════════════════════════════════

export interface WalletBalanceResponse {
    userId: string;
    balance: number;
    currency: string;
}

// Note: WalletTransactionResponse is defined in merchant.ts
// and re-exported via the barrel — use it from there.
