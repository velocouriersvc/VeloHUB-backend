import { AppDataSource } from "../db/data-source";
import { ServiceSubscription, ServiceSubscriptionStatus } from "../models/service-subscription";
import { BuyerProfile } from "../models/buyer-profile";
import { User } from "../models/user";
import { PaymentService } from "./payment/payment-service";
import { PaymentMethodType } from "../models/payment";
import { createServiceLogger } from "../utils/logger";

const log = createServiceLogger("SubscriptionService");

export class SubscriptionService {
    private subscriptionRepo = AppDataSource.getRepository(ServiceSubscription);
    private profileRepo = AppDataSource.getRepository(BuyerProfile);
    private userRepo = AppDataSource.getRepository(User);
    private paymentService = new PaymentService();

    async checkAccess(userId: string): Promise<boolean> {
        const profile = await this.profileRepo.findOne({ where: { userId } });
        return !!profile?.hasServicesAccess;
    }

    async initiateSubscription(userId: string, paymentMethod: PaymentMethodType, phoneNumber?: string) {
        const user = await this.userRepo.findOne({ where: { id: userId } });
        if (!user) throw new Error("User not found");

        const amount = 100; // 100 GHS/month

        // Create or find pending subscription
        let sub = await this.subscriptionRepo.findOne({ 
            where: { userId, status: ServiceSubscriptionStatus.PENDING } 
        });
        
        if (!sub) {
            sub = this.subscriptionRepo.create({
                userId,
                status: ServiceSubscriptionStatus.PENDING,
            });
            sub = await this.subscriptionRepo.save(sub);
        }

        // Process payment
        const result = await this.paymentService.processSubscriptionPayment({
            subscriptionId: sub.id,
            userId,
            amount,
            method: paymentMethod,
            country: user.country || "GH",
            phoneNumber: phoneNumber || user.phoneNumber || undefined,
            email: user.email || undefined,
        });

        if (!result.success) {
            // Payment initiation failed - clean up pending subscription
            await this.subscriptionRepo.delete(sub.id);
            log.warn("Subscription payment failed, removed pending record", {
                subscriptionId: sub.id,
                message: result.message,
            });
            throw new Error(result.message || "Payment initiation failed. Please try again.");
        }

        log.info("Subscription initiated", { userId, subscriptionId: sub.id });

        return {
            subscriptionId: sub.id,
            ...result
        };
    }

    async getSubscriptionStatus(userId: string) {
        const sub = await this.subscriptionRepo.findOne({
            where: { userId },
            order: { createdAt: "DESC" }
        });
        
        const profile = await this.profileRepo.findOne({ where: { userId } });
        
        return {
            status: sub?.status || "none",
            currentPeriodStart: sub?.currentPeriodStart,
            currentPeriodEnd: sub?.currentPeriodEnd,
            hasAccess: !!profile?.hasServicesAccess
        };
    }
}
