import axios, { AxiosError } from "axios";
import crypto from "crypto";
import {
    PaymentProvider,
    MomoPaymentRequest,
    PaymentVerification,
} from "./payment-provider.interface";
import { createServiceLogger } from "../../utils/logger";

const log = createServiceLogger("PaystackProvider");

const PAYSTACK_BASE_URL = "https://api.paystack.co";

export class PaystackProvider implements PaymentProvider {
    name = "paystack";
    private secretKey: string;

    constructor() {
        this.secretKey = process.env.PAYSTACK_SECRET_KEY || "";
        if (!this.secretKey) {
            log.warn("PAYSTACK_SECRET_KEY not set");
        }
    }

    private get headers() {
        return {
            Authorization: `Bearer ${this.secretKey}`,
            "Content-Type": "application/json",
        };
    }

    /**
     * Initiate a mobile money payment via Paystack's HOSTED checkout, restricted to the
     * mobile_money channel. The old raw `/charge` push flow silently dropped Paystack's
     * follow-up states (pay_offline / send_otp / display_text) and returned no URL, so
     * customers never received an actionable prompt. The hosted page drives the telco
     * prompt/OTP end to end and reports back through the same charge.success webhook.
     */
    async initiateMomoPayment(request: MomoPaymentRequest): Promise<{
        success: boolean;
        reference: string;
        providerRef: string;
        authorizationUrl?: string;
        message?: string;
    }> {
        try {
            const amountInSubunits = Math.round(request.amount * 100);

            const response = await axios.post(
                `${PAYSTACK_BASE_URL}/transaction/initialize`,
                {
                    email: request.email,
                    amount: amountInSubunits,
                    currency: request.currency || "GHS",
                    reference: request.reference,
                    channels: ["mobile_money"],
                    metadata: {
                        ...request.metadata,
                        custom_fields: [
                            {
                                display_name: "Phone Number",
                                variable_name: "phone_number",
                                value: request.phoneNumber,
                            },
                        ],
                    },
                    callback_url: request.callbackUrl,
                },
                { headers: this.headers }
            );

            const data = response.data.data;

            return {
                success: response.data.status === true && !!data?.authorization_url,
                reference: request.reference,
                providerRef: data?.reference || "",
                authorizationUrl: data?.authorization_url,
            };
        } catch (error) {
            const axErr = error as AxiosError<{ message?: string }>;
            const message = axErr.response?.data?.message || axErr.message;
            log.error("Paystack momo initialize error", { error: message });
            return {
                success: false,
                reference: request.reference,
                providerRef: "",
                message,
            };
        }
    }

    /**
     * Initialize a card/redirect transaction via Paystack. Returns an authorization
     * URL the client opens to complete payment (supports card, mobile money, bank, USSD).
     */
    async initiateCardPayment(request: {
        amount: number;
        currency?: string;
        email: string;
        reference: string;
        metadata?: Record<string, any>;
        callbackUrl?: string;
    }): Promise<{ success: boolean; reference: string; providerRef: string; authorizationUrl?: string; message?: string }> {
        try {
            const amountInPesewas = Math.round(request.amount * 100);

            const response = await axios.post(
                `${PAYSTACK_BASE_URL}/transaction/initialize`,
                {
                    email: request.email,
                    amount: amountInPesewas,
                    currency: request.currency || "GHS",
                    reference: request.reference,
                    metadata: request.metadata,
                    callback_url: request.callbackUrl,
                    channels: ["card", "mobile_money", "bank", "ussd"],
                },
                { headers: this.headers }
            );

            const data = response.data.data;
            return {
                success: response.data.status === true,
                reference: request.reference,
                providerRef: data?.reference || "",
                authorizationUrl: data?.authorization_url,
            };
        } catch (error) {
            const axErr = error as AxiosError<{ message?: string }>;
            const message = axErr.response?.data?.message || axErr.message;
            log.error("Paystack initialize error", { error: message });
            return { success: false, reference: request.reference, providerRef: "", message };
        }
    }

    /**
     * Refund a transaction back to the customer's original payment method
     * (momo / card). Amount is optional for a partial refund (major units, e.g.
     * GHS/NGN); omit for a full refund. Paystack returns the money to source.
     */
    async refund(reference: string, amount?: number): Promise<{ success: boolean; message?: string }> {
        try {
            const body: Record<string, any> = { transaction: reference };
            if (amount != null && amount > 0) body.amount = Math.round(amount * 100); // subunits
            const response = await axios.post(`${PAYSTACK_BASE_URL}/refund`, body, { headers: this.headers });
            return { success: response.data?.status === true };
        } catch (error) {
            const axErr = error as AxiosError<{ message?: string }>;
            const message = axErr.response?.data?.message || axErr.message;
            log.error("Paystack refund error", { reference, error: message });
            return { success: false, message };
        }
    }

    /**
     * Verify a payment transaction
     */
    async verifyPayment(reference: string): Promise<PaymentVerification> {
        try {
            const response = await axios.get(
                `${PAYSTACK_BASE_URL}/transaction/verify/${encodeURIComponent(reference)}`,
                { headers: this.headers }
            );

            const data = response.data.data;

            return {
                success: data.status === "success",
                reference: data.reference,
                providerRef: data.id?.toString() || "",
                providerStatus: data.status,
                amount: data.amount / 100, // Convert pesewas back to GHS
                currency: data.currency,
                metadata: data.metadata,
            };
        } catch (error) {
            const axErr = error as AxiosError<{ message?: string }>;
            log.error("Paystack verify error", { reference, error: axErr.response?.data?.message || axErr.message });
            return {
                success: false,
                reference,
                providerRef: "",
                providerStatus: "failed",
                amount: 0,
                currency: "GHS",
            };
        }
    }

    /**
     * Create (or fetch) a Paystack transfer recipient for a payout destination.
     * `type` is "mobile_money" (Ghana momo) or "nuban" (Nigeria bank). Returns the
     * recipient_code, which is stored and reused for all future transfers to that
     * account. Paystack is idempotent on identical account details.
     */
    async createTransferRecipient(input: {
        type: "mobile_money" | "nuban";
        name: string;
        account_number: string;
        bank_code: string;
        currency: string;
    }): Promise<{ success: boolean; recipientCode?: string; message?: string }> {
        try {
            const response = await axios.post(
                `${PAYSTACK_BASE_URL}/transferrecipient`,
                {
                    type: input.type,
                    name: input.name,
                    account_number: input.account_number,
                    bank_code: input.bank_code,
                    currency: input.currency,
                },
                { headers: this.headers }
            );
            const recipientCode = response.data?.data?.recipient_code;
            return { success: response.data?.status === true && !!recipientCode, recipientCode };
        } catch (error) {
            const axErr = error as AxiosError<{ message?: string }>;
            const message = axErr.response?.data?.message || axErr.message;
            log.error("Paystack create recipient error", { error: message });
            return { success: false, message };
        }
    }

    /**
     * Initiate a transfer (payout) from the Paystack balance to a stored recipient.
     * `amount` is in major units (GHS/NGN); converted to subunits here. Returns the
     * transfer_code and status (transfers may complete asynchronously via webhook).
     */
    async initiateTransfer(input: {
        amount: number;
        recipient: string;
        currency: string;
        reason: string;
        reference: string;
    }): Promise<{ success: boolean; transferCode?: string; status?: string; message?: string }> {
        try {
            const response = await axios.post(
                `${PAYSTACK_BASE_URL}/transfer`,
                {
                    source: "balance",
                    amount: Math.round(input.amount * 100),
                    recipient: input.recipient,
                    currency: input.currency,
                    reason: input.reason,
                    reference: input.reference,
                },
                { headers: this.headers }
            );
            const data = response.data?.data;
            // "success", "pending", and "otp" all mean the transfer was accepted;
            // only an exception (caught below) is a hard failure.
            return {
                success: response.data?.status === true,
                transferCode: data?.transfer_code,
                status: data?.status,
            };
        } catch (error) {
            const axErr = error as AxiosError<{ message?: string }>;
            const message = axErr.response?.data?.message || axErr.message;
            log.error("Paystack transfer error", { reference: input.reference, error: message });
            return { success: false, message };
        }
    }

    /**
     * Verify Paystack webhook signature
     */
    verifyWebhookSignature(payload: string, signature: string): boolean {
        const hash = crypto
            .createHmac("sha512", this.secretKey)
            .update(payload)
            .digest("hex");

        return hash === signature;
    }

}
