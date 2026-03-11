import { SettlementType } from "../services/settlement-service";

// ═══════════════════════════════════════════════════════════════════
//  SETTLEMENT – Types
// ═══════════════════════════════════════════════════════════════════

/** Return shape of SettlementService.settleOrder() */
export interface SettlementResultDTO {
    orderId: string;
    orderNumber: string;
    settlementType: SettlementType;
    merchantEarnings: number;
    driverEarnings: number;
    platformFee: number;
    currency: string;
    merchantWalletCredited: boolean;
    driverWalletCredited: boolean;
    driverWalletDebited: boolean;
    merchantWalletDebited: boolean;
}

/** Settlement breakdown returned to controllers */
export interface SettlementBreakdownResponse {
    merchantEarnings: number;
    platformFee: number;
    driverEarnings: number;
    settlementType: SettlementType;
    walletCredited: boolean;
}
