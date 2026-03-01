import { AppDataSource } from "../../db/data-source";
import { Payment, PaymentMethodType, PaymentRecordStatus } from "../../models/payment";
import { PaymentProvider } from "./payment-provider.interface";
import { PaystackProvider } from "./paystack-provider";
import { WalletService } from "../wallet-service";
import { v4 as uuidv4 } from "uuid";

const PLATFORM_COMMISSION = 0.2; // 20%
const DRIVER_SHARE = 0.8; // 80%

export interface PaymentResult {
    success: boolean;
    paymentId: string;
    reference: string;
    status: PaymentRecordStatus;
    authorizationUrl?: string; // For momo redirect flows
    message?: string;
}

export class PaymentService {
    private paymentRepo = AppDataSource.getRepository(Payment);
    private provider: PaymentProvider;
    private walletService: WalletService;

    constructor() {
        this.provider = new PaystackProvider();
        this.walletService = new WalletService();
    }

    /**
     * Process a ride payment based on payment method
     */
    async processRidePayment(params: {
        rideId: string;
        userId: string;
        amount: number;
        method: PaymentMethodType;
        email?: string;
        phoneNumber?: string;
    }): Promise<PaymentResult> {
        const { rideId, userId, amount, method } = params;
        const reference = `RIDE-${uuidv4().slice(0, 12)}`;
        const platformFee = Math.round(amount * PLATFORM_COMMISSION * 100) / 100;
        const driverAmount = Math.round(amount * DRIVER_SHARE * 100) / 100;

        // Create payment record
        const payment = this.paymentRepo.create({
            rideId,
            userId,
            amount,
            currency: "GHS",
            method,
            provider: method === PaymentMethodType.WALLET ? "wallet" : this.provider.name,
            providerRef: null,
            providerStatus: null,
            platformFee,
            driverAmount,
            status: PaymentRecordStatus.PENDING,
            metadata: { reference },
        });
        const saved = await this.paymentRepo.save(payment);

        switch (method) {
            case PaymentMethodType.MOMO:
                return this.processMomoPayment(saved, reference, params);

            case PaymentMethodType.WALLET:
                return this.processWalletPayment(saved, reference, userId, amount);

            case PaymentMethodType.CASH:
                return this.processCashPayment(saved, reference);

            default:
                throw new Error(`Unsupported payment method: ${method}`);
        }
    }

    /**
     * Mobile money payment via provider (Paystack)
     */
    private async processMomoPayment(
        payment: Payment,
        reference: string,
        params: { email?: string; phoneNumber?: string; amount: number }
    ): Promise<PaymentResult> {
        if (!params.phoneNumber) {
            throw new Error("Phone number is required for momo payment");
        }

        const result = await this.provider.initiateMomoPayment({
            amount: params.amount,
            currency: "GHS",
            email: params.email || `${params.phoneNumber}@velo.app`,
            phoneNumber: params.phoneNumber,
            reference,
            metadata: { rideId: payment.rideId, paymentId: payment.id },
        });

        // Update payment record with provider info
        payment.providerRef = result.providerRef;
        payment.providerStatus = result.success ? "pending" : "failed";
        if (!result.success) {
            payment.status = PaymentRecordStatus.FAILED;
        }
        await this.paymentRepo.save(payment);

        return {
            success: result.success,
            paymentId: payment.id,
            reference,
            status: payment.status,
            authorizationUrl: result.authorizationUrl,
            message: result.success
                ? "Momo payment initiated. Approve on your phone."
                : "Payment initiation failed. Please try again.",
        };
    }

    /**
     * Wallet payment — instant debit
     */
    private async processWalletPayment(
        payment: Payment,
        reference: string,
        userId: string,
        amount: number
    ): Promise<PaymentResult> {
        const hasBalance = await this.walletService.hasEnoughBalance(userId, amount);
        if (!hasBalance) {
            payment.status = PaymentRecordStatus.FAILED;
            payment.providerStatus = "insufficient_balance";
            await this.paymentRepo.save(payment);

            return {
                success: false,
                paymentId: payment.id,
                reference,
                status: PaymentRecordStatus.FAILED,
                message: "Insufficient wallet balance",
            };
        }

        // Debit customer wallet
        await this.walletService.debit(userId, amount, `Ride payment`, {
            rideId: payment.rideId,
            paymentId: payment.id,
        });

        // Mark as successful
        payment.status = PaymentRecordStatus.SUCCESS;
        payment.providerStatus = "completed";
        payment.providerRef = reference;
        payment.completedAt = new Date();
        await this.paymentRepo.save(payment);

        return {
            success: true,
            paymentId: payment.id,
            reference,
            status: PaymentRecordStatus.SUCCESS,
            message: "Payment successful via wallet",
        };
    }

    /**
     * Cash payment — just mark as pending, driver collects later
     */
    private async processCashPayment(
        payment: Payment,
        reference: string
    ): Promise<PaymentResult> {
        payment.providerStatus = "cash_on_delivery";
        payment.providerRef = reference;
        await this.paymentRepo.save(payment);

        return {
            success: true,
            paymentId: payment.id,
            reference,
            status: PaymentRecordStatus.PENDING,
            message: "Cash payment — pay driver after ride",
        };
    }

    /**
     * Handle webhook from payment provider (Paystack)
     */
    async handleWebhook(payload: string, signature: string): Promise<void> {
        const isValid = this.provider.verifyWebhookSignature(payload, signature);
        if (!isValid) {
            throw new Error("Invalid webhook signature");
        }

        const event = JSON.parse(payload);

        if (event.event === "charge.success") {
            const reference = event.data.reference;
            await this.confirmPayment(reference);
        }
    }

    /**
     * Confirm a pending payment (called by webhook or manual verification)
     */
    async confirmPayment(reference: string): Promise<Payment | null> {
        // Find payment by reference in metadata
        const payments = await this.paymentRepo.find({
            where: { status: PaymentRecordStatus.PENDING },
        });

        const payment = payments.find(
            (p) => p.metadata && (p.metadata as any).reference === reference
        );

        if (!payment) return null;

        // Verify with provider
        const verification = await this.provider.verifyPayment(reference);

        if (verification.success) {
            payment.status = PaymentRecordStatus.SUCCESS;
            payment.providerStatus = verification.providerStatus;
            payment.providerRef = verification.providerRef;
            payment.completedAt = new Date();
        } else {
            payment.status = PaymentRecordStatus.FAILED;
            payment.providerStatus = verification.providerStatus;
        }

        return this.paymentRepo.save(payment);
    }

    /**
     * Credit driver earnings after a completed ride
     */
    async creditDriverEarnings(
        driverId: string,
        rideId: string,
        totalFare: number
    ): Promise<void> {
        const driverAmount = Math.round(totalFare * DRIVER_SHARE * 100) / 100;

        await this.walletService.credit(driverId, driverAmount, "Ride earnings", {
            rideId,
            totalFare,
            driverShare: DRIVER_SHARE,
            platformCommission: PLATFORM_COMMISSION,
        });
    }

    /**
     * Mark cash payment as collected by driver
     */
    async confirmCashPayment(rideId: string): Promise<Payment | null> {
        const payment = await this.paymentRepo.findOne({
            where: { rideId, method: PaymentMethodType.CASH },
        });

        if (!payment) return null;

        payment.status = PaymentRecordStatus.SUCCESS;
        payment.providerStatus = "cash_collected";
        payment.completedAt = new Date();

        return this.paymentRepo.save(payment);
    }

    /**
     * Get payment by ride ID
     */
    async getPaymentByRideId(rideId: string): Promise<Payment | null> {
        return this.paymentRepo.findOne({ where: { rideId } });
    }

    /**
     * Get payment history for a user
     */
    async getUserPayments(
        userId: string,
        limit: number = 20,
        offset: number = 0
    ): Promise<{ payments: Payment[]; total: number }> {
        const [payments, total] = await this.paymentRepo.findAndCount({
            where: { userId },
            order: { createdAt: "DESC" },
            take: limit,
            skip: offset,
        });

        return { payments, total };
    }
}
