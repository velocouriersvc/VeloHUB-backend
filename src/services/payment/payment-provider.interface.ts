/**
 * Payment provider interface — swap out Paystack for any other provider
 * by implementing this interface.
 */
export interface MomoPaymentRequest {
    amount: number; // in GHS
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
    }>;

    /**
     * Verify a payment by reference
     */
    verifyPayment(reference: string): Promise<PaymentVerification>;

    /**
     * Verify that a webhook payload is authentic
     */
    verifyWebhookSignature(payload: string, signature: string): boolean;
}
