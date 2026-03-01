import axios from "axios";
import crypto from "crypto";
import {
    PaymentProvider,
    MomoPaymentRequest,
    PaymentVerification,
} from "./payment-provider.interface";

const PAYSTACK_BASE_URL = "https://api.paystack.co";

export class PaystackProvider implements PaymentProvider {
    name = "paystack";
    private secretKey: string;

    constructor() {
        this.secretKey = process.env.PAYSTACK_SECRET_KEY || "";
        if (!this.secretKey) {
            console.warn("⚠️ PAYSTACK_SECRET_KEY not set");
        }
    }

    private get headers() {
        return {
            Authorization: `Bearer ${this.secretKey}`,
            "Content-Type": "application/json",
        };
    }

    /**
     * Initiate a mobile money charge via Paystack
     */
    async initiateMomoPayment(request: MomoPaymentRequest): Promise<{
        success: boolean;
        reference: string;
        providerRef: string;
        authorizationUrl?: string;
    }> {
        try {
            // Paystack amounts are in pesewas (smallest currency unit)
            const amountInPesewas = Math.round(request.amount * 100);

            const response = await axios.post(
                `${PAYSTACK_BASE_URL}/charge`,
                {
                    email: request.email,
                    amount: amountInPesewas,
                    currency: request.currency || "GHS",
                    reference: request.reference,
                    mobile_money: {
                        phone: request.phoneNumber,
                        provider: this.detectMomoProvider(request.phoneNumber),
                    },
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
                success: response.data.status === true,
                reference: request.reference,
                providerRef: data.reference || data.id?.toString() || "",
                authorizationUrl: data.authorization_url,
            };
        } catch (error: any) {
            console.error("Paystack charge error:", error.response?.data || error.message);
            return {
                success: false,
                reference: request.reference,
                providerRef: "",
            };
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
        } catch (error: any) {
            console.error("Paystack verify error:", error.response?.data || error.message);
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
     * Verify Paystack webhook signature
     */
    verifyWebhookSignature(payload: string, signature: string): boolean {
        const hash = crypto
            .createHmac("sha512", this.secretKey)
            .update(payload)
            .digest("hex");

        return hash === signature;
    }

    /**
     * Detect mobile money provider from Ghana phone number
     * MTN: 024, 054, 055, 059
     * Vodafone: 020, 050
     * AirtelTigo: 027, 057, 026, 056
     */
    private detectMomoProvider(phone: string): string {
        // Strip country code if present
        const local = phone.replace(/^\+233/, "0");
        const prefix = local.substring(0, 3);

        const mtnPrefixes = ["024", "054", "055", "059"];
        const vodaPrefixes = ["020", "050"];

        if (mtnPrefixes.includes(prefix)) return "mtn";
        if (vodaPrefixes.includes(prefix)) return "vod";
        return "tgo"; // AirtelTigo as default for others
    }
}
