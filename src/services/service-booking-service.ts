import { AppDataSource } from "../db/data-source";
import { ServiceBooking, ServiceBookingStatus, ServicePaymentMethod, ServicePaymentStatus } from "../models/service-booking";
import { User } from "../models/user";
import { PlatformSettings } from "../models/platform-settings";
import { PaymentService } from "./payment/payment-service";
import { NotificationService } from "./notification-service";
import { NotificationType } from "../models/notification";
import { SettlementService } from "./settlement-service";
import { createServiceLogger } from "../utils/logger";
import { v4 as uuidv4 } from "uuid";

const log = createServiceLogger("ServiceBookingService");

export interface CreateBookingInput {
    customerId: string;
    merchantId: string;
    productId: string;
    serviceTitle: string;
    price: number;
    preferredDate: string;
    preferredTimeSlot?: string;
    serviceAddress?: string;
    customerNotes?: string;
    paymentMethod: ServicePaymentMethod;
    phoneNumber?: string;
    latitude?: number;
    longitude?: number;
}

export class ServiceBookingService {
    private bookingRepo = AppDataSource.getRepository(ServiceBooking);
    private userRepo = AppDataSource.getRepository(User);
    private settingsRepo = AppDataSource.getRepository(PlatformSettings);
    
    private paymentService = new PaymentService();
    private notificationService = new NotificationService();
    private settlementService = new SettlementService();

    async createBooking(input: CreateBookingInput) {
        // 1. Resolve currency
        const user = await this.userRepo.findOne({ where: { id: input.customerId } });
        if (!user) throw new Error("User not found");
        
        const settings = await this.settingsRepo.findOne({ 
            where: { country: user.country || "GH", isActive: true } 
        });
        const currency = settings?.currency || "GHS";

        // 2. Generate booking number
        const bookingNumber = `SRV-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${uuidv4().slice(0, 6).toUpperCase()}`;

        // 3. Create booking record
        const booking = this.bookingRepo.create({
            bookingNumber,
            customerId: input.customerId,
            merchantId: input.merchantId,
            productId: input.productId,
            serviceTitle: input.serviceTitle,
            price: input.price,
            currency,
            preferredDate: new Date(input.preferredDate),
            preferredTimeSlot: input.preferredTimeSlot || null,
            serviceAddress: input.serviceAddress || null,
            latitude: input.latitude || null,
            longitude: input.longitude || null,
            customerNotes: input.customerNotes || null,
            status: ServiceBookingStatus.REQUESTED,
            paymentMethod: input.paymentMethod,
            paymentStatus: ServicePaymentStatus.PENDING,
            completionCode: uuidv4().slice(0, 6).toUpperCase(), // Generate 6-char code
        });

        const savedBooking = await this.bookingRepo.save(booking);

        // 4. Initiate payment
        const paymentResult = await this.paymentService.processServiceBookingPayment({
            serviceBookingId: savedBooking.id,
            userId: input.customerId,
            amount: input.price,
            method: input.paymentMethod as any,
            country: user.country,
            phoneNumber: input.phoneNumber || user.phoneNumber || undefined,
            email: user.email || undefined,
        });

        // 5. Notify merchant
        await this.notificationService.notify(
            input.merchantId,
            NotificationType.SERVICE_REQUESTED,
            "New Service Booking! 🛠️",
            `New request for "${input.serviceTitle}"${input.serviceAddress ? ` at ${input.serviceAddress}` : ''}.`,
            { bookingId: savedBooking.id, bookingNumber }
        );

        log.info("Service booking created", { bookingId: savedBooking.id, bookingNumber });

        return {
            booking: savedBooking,
            payment: paymentResult
        };
    }

    async updateStatus(bookingId: string, userId: string, status: ServiceBookingStatus, note?: string) {
        const booking = await this.bookingRepo.findOne({
            where: { id: bookingId },
            relations: { customer: true, merchant: true }
        });

        if (!booking) throw new Error("Booking not found");

        // Authorization check
        if (booking.customerId !== userId && booking.merchantId !== userId) {
            throw new Error("Unauthorized to update this booking");
        }

        const oldStatus = booking.status;
        booking.status = status;

        if (status === ServiceBookingStatus.ACCEPTED) booking.scheduledAt = new Date();
        if (status === ServiceBookingStatus.IN_PROGRESS) booking.startedAt = new Date();
        if (status === ServiceBookingStatus.COMPLETED) booking.completedAt = new Date();
        if (status === ServiceBookingStatus.DECLINED) booking.declinedAt = new Date();

        await this.bookingRepo.save(booking);

        // If completed, trigger settlement
        if (status === ServiceBookingStatus.COMPLETED) {
            await this.settlementService.settleServiceBooking(bookingId, userId, "merchant");
        }

        // Notifications
        const recipientId = userId === booking.customerId ? booking.merchantId : booking.customerId;
        let notificationType: NotificationType;
        
        switch (status) {
            case ServiceBookingStatus.ACCEPTED: notificationType = NotificationType.SERVICE_ACCEPTED; break;
            case ServiceBookingStatus.DECLINED: notificationType = NotificationType.SERVICE_DECLINED; break;
            case ServiceBookingStatus.SCHEDULED: notificationType = NotificationType.SERVICE_SCHEDULED; break;
            case ServiceBookingStatus.IN_PROGRESS: notificationType = NotificationType.SERVICE_STARTED; break;
            case ServiceBookingStatus.COMPLETED: notificationType = NotificationType.SERVICE_COMPLETED; break;
            case ServiceBookingStatus.CANCELLED: notificationType = NotificationType.SERVICE_CANCELLED; break;
            default: notificationType = NotificationType.SYSTEM;
        }

        await this.notificationService.notify(
            recipientId,
            notificationType,
            "Booking Update 🗓️",
            `Your booking #${booking.bookingNumber} is now ${status}.`,
            { bookingId: booking.id, status }
        );

        log.info("Service booking status updated", { bookingId, oldStatus, newStatus: status, userId });

        return booking;
    }

    async getMyBookings(customerId: string) {
        return this.bookingRepo.find({
            where: { customerId },
            order: { createdAt: "DESC" }
        });
    }

    async getMerchantBookings(merchantId: string) {
        const bookings = await this.bookingRepo.find({
            where: { merchantId },
            relations: { 
                customer: { 
                    buyerProfile: true 
                } 
            },
            order: { createdAt: "DESC" }
        });

        // Map to include customer profile details as requested
        return bookings.map(b => ({
            ...b,
            customerProfile: {
                customerName: b.customer?.buyerProfile?.fullName || "Valued Customer",
                customerPhone: b.customer?.phoneNumber || "N/A",
                customerRating: 5.0, // Default for now
            }
        }));
    }

    /**
     * Merchant completes booking by verifying completion code provided by customer.
     */
    async completeBooking(bookingId: string, merchantId: string, completionCode: string) {
        const booking = await this.bookingRepo.findOne({
            where: { id: bookingId, merchantId },
            relations: { customer: true, merchant: true }
        });

        if (!booking) throw new Error("Booking not found");

        if (booking.completionCode !== completionCode) {
            throw new Error("Invalid completion code");
        }

        if (booking.status === ServiceBookingStatus.COMPLETED) {
            throw new Error("Booking already completed");
        }

        booking.status = ServiceBookingStatus.COMPLETED;
        booking.completedAt = new Date();
        await this.bookingRepo.save(booking);

        // Trigger settlement
        await this.settlementService.settleServiceBooking(bookingId, merchantId, "merchant");

        // Notify customer
        await this.notificationService.notify(
            booking.customerId,
            NotificationType.SERVICE_COMPLETED,
            "Service Completed! ✅",
            `Your booking #${booking.bookingNumber} has been verified and completed.`,
            { bookingId }
        );

        log.info("Service booking completed via code", { bookingId, merchantId });

        return booking;
    }

    async getBookingById(bookingId: string, userId: string) {
        const booking = await this.bookingRepo.findOne({
            where: { id: bookingId },
            relations: { customer: true, merchant: true, product: true }
        });

        if (booking && booking.customerId !== userId && booking.merchantId !== userId) {
            throw new Error("Unauthorized to view this booking");
        }

        return booking;
    }
}
