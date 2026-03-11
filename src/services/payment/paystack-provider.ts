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
        } catch (error) {
            const axErr = error as AxiosError<{ message?: string }>;
            log.error("Paystack charge error", { error: axErr.response?.data?.message || axErr.message });
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
     * Detect mobile money provider from phone number.
     * Currently supports Ghana & Nigeria prefixes.
     *
     * Ghana — MTN: 024,054,055,059 | Vodafone: 020,050 | AirtelTigo: 027,057,026,056
     * Nigeria — MTN: 0803,0806,0703,0903 | Airtel: 0802,0708,0902 | Glo: 0805,0705,0905 | 9mobile: 0809,0909
     */
    private detectMomoProvider(phone: string): string {
        // Strip common country codes
        let local = phone.replace(/^\+233/, "0").replace(/^\+234/, "0");

        // Ghana detection (3-digit prefix)
        const ghPrefix = local.substring(0, 3);
        const ghMtn = ["024", "054", "055", "059"];
        const ghVoda = ["020", "050"];

        if (ghMtn.includes(ghPrefix)) return "mtn";
        if (ghVoda.includes(ghPrefix)) return "vod";

        // Nigeria detection (4-digit prefix)
        const ngPrefix = local.substring(0, 4);
        const ngMtn = ["0803", "0806", "0703", "0903", "0816"];
        const ngAirtel = ["0802", "0708", "0902", "0812"];

        if (ngMtn.includes(ngPrefix)) return "mtn";
        if (ngAirtel.includes(ngPrefix)) return "airtel";

        return "tgo"; // AirtelTigo as default fallback
    }
}
