/**
 * Payment provider interface - swap out Paystack for any other provider
 * by implementing this interface.
 */
export interface MomoPaymentRequest {
    amount: number; // in the currency's major unit (e.g. GHS, NGN, USD)
    currency: string;
    email: string;
    phoneNumber: string;
    reference: string;
    callbackUrl?: string;
    metadata?: Record<string, any>;
}

export interface PaymentVerification {
    success: boolean;
    reference: string;
    providerRef: string;
    providerStatus: string;
    amount: number;
    currency: string;
    metadata?: Record<string, any>;
}

export interface PaymentProvider {
    name: string;

    /**
     * Initiate a mobile money payment
     */
    initiateMomoPayment(request: MomoPaymentRequest): Promise<{
        success: boolean;
        reference: string;
        providerRef: string;
        authorizationUrl?: string; // for redirect-based flows
        message?: string; // provider error detail on failure
    }>;

    /**
     * Initialize a card/redirect transaction (returns an authorization URL).
     * Optional so providers that don't support it can be omitted.
     */
    initiateCardPayment?(request: {
        amount: number;
        currency?: string;
        email: string;
        reference: string;
        metadata?: Record<string, any>;
        callbackUrl?: string;
    }): Promise<{
        success: boolean;
        reference: string;
        providerRef: string;
        authorizationUrl?: string;
        message?: string; // provider error detail on failure
    }>;

    /**
     * Refund a paid transaction back to source (optional; Paystack supports it).
     * Amount in major units for a partial refund; omit for a full refund.
     */
    refund?(reference: string, amount?: number): Promise<{ success: boolean; message?: string }>;

    /**
     * Create/fetch a transfer recipient for payouts (optional; Paystack supports it).
     * Returns a recipient code to store and reuse for future transfers.
     */
    createTransferRecipient?(input: {
        type: "mobile_money" | "nuban";
        name: string;
        account_number: string;
        bank_code: string;
        currency: string;
    }): Promise<{ success: boolean; recipientCode?: string; message?: string }>;

    /**
     * Initiate a payout transfer to a stored recipient (optional; Paystack supports it).
     * Amount in major units.
     */
    initiateTransfer?(input: {
        amount: number;
        recipient: string;
        currency: string;
        reason: string;
        reference: string;
    }): Promise<{ success: boolean; transferCode?: string; status?: string; message?: string }>;

    /**
     * Verify a payment by reference
     */
    verifyPayment(reference: string): Promise<PaymentVerification>;

    /**
     * Verify that a webhook payload is authentic
     */
    verifyWebhookSignature(payload: string, signature: string): boolean;
}
