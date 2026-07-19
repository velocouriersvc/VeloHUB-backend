import { AppDataSource } from "../db/data-source";
import { ServiceBooking, ServiceBookingStatus, ServicePaymentMethod, ServicePaymentStatus, ServiceCallType } from "../models/service-booking";
import { User } from "../models/user";
import { PlatformSettings } from "../models/platform-settings";
import { MerchantProfile } from "../models/merchant-profile";
import { Product } from "../models/product";
import { In } from "typeorm";
import { PaymentService } from "./payment/payment-service";
import { NotificationService } from "./notification-service";
import { NotificationType } from "../models/notification";
import { SettlementService } from "./settlement-service";
import { WalletService } from "./wallet-service";
import { createServiceLogger } from "../utils/logger";
import { redis } from "../utils/redis";
import { v4 as uuidv4 } from "uuid";

// Platform policy constants for the services vertical.
export const MAX_TRAVEL_KM = 20;
export const CANCEL_FREE_HOURS = 3;      // full refund when cancelling earlier than this
export const LATE_CANCEL_FEE_RATE = 0.7; // penalty within the window; paid out to the provider
export const EXPIRY_LEAD_HOURS = 2;      // unaccepted requests expire this close to start
const QUOTE_TTL_SECONDS = 15 * 60;       // travel-fee quotes lock prices for 15 minutes

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLng = ((lng2 - lng1) * Math.PI) / 180;
    const a = Math.sin(dLat / 2) ** 2
        + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Start time of a booking from its date + slot text ("02:30 PM" or "09:00 - 12:00"). */
export function bookingStartAt(preferredDate: Date | string, slot?: string | null): Date {
    const d = new Date(preferredDate);
    let hours = 9, minutes = 0; // default when no slot recorded
    const m = String(slot || "").match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
    if (m) {
        const rawHour = parseInt(m[1], 10);
        const meridian = m[3]?.toUpperCase();
        if (meridian === "PM") hours = (rawHour % 12) + 12;
        else if (meridian === "AM") hours = rawHour % 12;
        else hours = rawHour;
        minutes = parseInt(m[2], 10);
    }
    d.setHours(hours, minutes, 0, 0);
    return d;
}

const log = createServiceLogger("ServiceBookingService");

export interface CreateBookingInput {
    customerId: string;
    merchantId: string;
    productId: string;
    serviceTitle: string;
    price: number;
    preferredDate: string;
    /** Multi-date bookings: one booking is created per date (same slot each day). */
    preferredDates?: string[];
    preferredTimeSlot?: string;
    serviceAddress?: string;
    customerNotes?: string;
    paymentMethod: ServicePaymentMethod;
    phoneNumber?: string;
    latitude?: number;
    longitude?: number;
    callType?: "in_call" | "out_call";
}

export class ServiceBookingService {
    private bookingRepo = AppDataSource.getRepository(ServiceBooking);
    private userRepo = AppDataSource.getRepository(User);
    private settingsRepo = AppDataSource.getRepository(PlatformSettings);
    private merchantProfileRepo = AppDataSource.getRepository(MerchantProfile);
    private productRepo = AppDataSource.getRepository(Product);

    private paymentService = new PaymentService();
    private notificationService = new NotificationService();
    private settlementService = new SettlementService();
    private walletService = new WalletService();

    // ── Travel quote (in-call / out-call) ───────────────────────────

    private quoteKey(customerId: string, productId: string, callType: string) {
        return `svc:quote:${customerId}:${productId}:${callType}`;
    }

    /**
     * Validate the call type against the provider settings and, for out-call,
     * the travel radius (hard cap 20km); compute the travel fee and LOCK it in
     * Redis for 15 minutes so provider fee edits never change an active checkout.
     */
    async quoteBooking(input: {
        customerId: string; merchantId: string; productId: string;
        callType: "in_call" | "out_call"; latitude?: number; longitude?: number;
    }) {
        const profile = await this.merchantProfileRepo.findOne({ where: { userId: input.merchantId } });
        if (!profile) throw new Error("Provider not found");

        // The LISTING's call types are authoritative (round-14: set per service);
        // older listings without flags fall back to the provider profile switches.
        const listing = await this.productRepo.findOne({ where: { id: input.productId } });
        const inCall = listing ? listing.inCall !== false : profile.inCallEnabled !== false;
        const outCall = listing ? listing.outCall === true : profile.outCallEnabled === true;
        if (input.callType === "in_call" && !inCall) throw new Error("This service is not offered in-call");
        if (input.callType === "out_call" && !outCall) throw new Error("This service is not offered as in-home / mobile");

        let travelFee = 0;
        let distanceKm: number | null = null;
        if (input.callType === "out_call") {
            if (input.latitude == null || input.longitude == null) {
                throw new Error("Your address is required for out-call bookings");
            }
            if (profile.latitude == null || profile.longitude == null) {
                throw new Error("Provider has no service location set");
            }
            distanceKm = Math.round(haversineKm(
                Number(input.latitude), Number(input.longitude),
                Number(profile.latitude), Number(profile.longitude)
            ) * 10) / 10;
            const limit = Math.min(Number(profile.travelDistanceKm) || MAX_TRAVEL_KM, MAX_TRAVEL_KM);
            if (distanceKm > limit) {
                throw new Error("Provider does not travel to this area");
            }
            travelFee = Math.round((Number(profile.travelFeeBase || 0) + Number(profile.travelFeePerKm || 0) * distanceKm) * 100) / 100;
        }

        // Customer-paid platform fee for facilitating the booking:
        // fixed serviceBookingFee + serviceBookingFeeRate% of the service price
        // (admin-editable per country). Applied per booked date.
        const merchantUser = await this.userRepo.findOne({ where: { id: input.merchantId } });
        const settings = await this.settingsRepo.findOne({ where: { country: merchantUser?.country || "GH", isActive: true } });
        const price = Number(listing?.price || 0);
        const platformFee = Math.round((Number(settings?.serviceBookingFee || 0) + price * Number(settings?.serviceBookingFeeRate || 0) / 100) * 100) / 100;

        const quote = {
            callType: input.callType,
            travelFee,
            platformFee,
            distanceKm,
            inCallEnabled: inCall,
            outCallEnabled: outCall,
            providerTimezone: profile.timezone || "Africa/Accra",
            lockedUntil: new Date(Date.now() + QUOTE_TTL_SECONDS * 1000).toISOString(),
            policy: {
                freeCancellationHours: CANCEL_FREE_HOURS,
                lateCancellationFeePercent: LATE_CANCEL_FEE_RATE * 100,
                expiryLeadHours: EXPIRY_LEAD_HOURS,
            },
        };
        await redis.set(this.quoteKey(input.customerId, input.productId, input.callType), JSON.stringify(quote), "EX", QUOTE_TTL_SECONDS);
        return quote;
    }

    /** Fee used at creation: the locked quote when active, else computed fresh. */
    private async resolveQuote(input: CreateBookingInput): Promise<{ travelFee: number; platformFee: number; distanceKm: number | null; providerTimezone: string }> {
        const callType = input.callType || "in_call";
        const cached = await redis.get(this.quoteKey(input.customerId, input.productId, callType)).catch(() => null);
        if (cached) {
            const q = JSON.parse(cached);
            return { travelFee: Number(q.travelFee) || 0, platformFee: Number(q.platformFee) || 0, distanceKm: q.distanceKm ?? null, providerTimezone: q.providerTimezone || "Africa/Accra" };
        }
        const q = await this.quoteBooking({
            customerId: input.customerId, merchantId: input.merchantId, productId: input.productId,
            callType, latitude: input.latitude, longitude: input.longitude,
        });
        return { travelFee: q.travelFee, platformFee: q.platformFee, distanceKm: q.distanceKm, providerTimezone: q.providerTimezone };
    }

    /** Merchant slot-conflict + same-customer duplicate guard for one date. */
    private async assertSlotAvailable(input: CreateBookingInput, dateStr: string): Promise<void> {
        if (!input.preferredTimeSlot) return;
        const bookingDate = new Date(dateStr).toISOString().slice(0, 10);
        const [reqStart, reqEnd] = input.preferredTimeSlot.split('-').map(t => t.trim());
        const terminal = [
            ServiceBookingStatus.COMPLETED,
            ServiceBookingStatus.CANCELLED,
            ServiceBookingStatus.DECLINED,
            ServiceBookingStatus.EXPIRED,
            ServiceBookingStatus.CUSTOMER_CANCELLED,
            ServiceBookingStatus.PROVIDER_CANCELLED,
        ];

        const activeBookings = await this.bookingRepo
            .createQueryBuilder("b")
            .where("b.merchantId = :merchantId", { merchantId: input.merchantId })
            .andWhere("DATE(b.preferredDate) = :date", { date: bookingDate })
            .andWhere("b.status NOT IN (:...terminal)", { terminal })
            .getMany();

        const hasConflict = activeBookings.some((existing) => {
            if (!existing.preferredTimeSlot) return false;
            const [exStart, exEnd] = existing.preferredTimeSlot.split('-').map(t => t.trim());
            return reqStart < (exEnd ?? exStart) && exStart < (reqEnd ?? reqStart);
        });
        if (hasConflict) {
            throw new Error(`The ${input.preferredTimeSlot} slot on ${bookingDate} is already booked. Please select a different time.`);
        }

        const duplicate = activeBookings.find((b) =>
            b.customerId === input.customerId
            && b.productId === input.productId
            && b.preferredTimeSlot === input.preferredTimeSlot
        );
        if (duplicate) {
            throw new Error(`You already have a booking for this service on ${bookingDate} at the selected time.`);
        }
    }

    async createBooking(input: CreateBookingInput) {
        // 1. Resolve currency
        const user = await this.userRepo.findOne({ where: { id: input.customerId } });
        if (!user) throw new Error("User not found");

        const settings = await this.settingsRepo.findOne({
            where: { country: user.country || "GH", isActive: true }
        });
        const currency = settings?.currency || "GHS";

        // 2. Dates: one booking per selected date (multi-date support).
        const dates = Array.from(new Set(
            (input.preferredDates?.length ? input.preferredDates : [input.preferredDate]).filter(Boolean)
        ));
        if (!dates.length) throw new Error("Select at least one date");
        if (dates.length > 10) throw new Error("You can book at most 10 dates at once");

        // 3. Call type + travel fee (uses the 15-minute locked quote when present;
        //    enforces in-call/out-call availability and the 20km travel radius).
        const quote = await this.resolveQuote(input);

        // 4. Validate every date before creating anything
        for (const dateStr of dates) {
            await this.assertSlotAvailable(input, dateStr);
        }

        // 5. Create one booking per date
        const bookings: ServiceBooking[] = [];
        for (const dateStr of dates) {
            const bookingNumber = `SRV-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${uuidv4().slice(0, 6).toUpperCase()}`;
            const booking = this.bookingRepo.create({
                bookingNumber,
                customerId: input.customerId,
                merchantId: input.merchantId,
                productId: input.productId,
                serviceTitle: input.serviceTitle,
                price: input.price,
                currency,
                preferredDate: new Date(dateStr),
                preferredTimeSlot: input.preferredTimeSlot || null,
                serviceAddress: input.serviceAddress || null,
                latitude: input.latitude || null,
                longitude: input.longitude || null,
                customerNotes: input.customerNotes || null,
                status: ServiceBookingStatus.REQUESTED,
                paymentMethod: input.paymentMethod,
                paymentStatus: ServicePaymentStatus.PENDING,
                completionCode: uuidv4().slice(0, 6).toUpperCase(),
                callType: input.callType || ServiceCallType.IN_CALL,
                travelFee: quote.travelFee,
                platformFee: quote.platformFee,
                travelDistanceKm: quote.distanceKm,
                providerTimezone: quote.providerTimezone,
            });
            bookings.push(await this.bookingRepo.save(booking));
        }

        // 6. One combined payment covering all dates (price + travel fee + platform fee per date)
        const totalAmount = Math.round((Number(input.price) + quote.travelFee + quote.platformFee) * dates.length * 100) / 100;
        const paymentResult = await this.paymentService.processServiceBookingPayment({
            serviceBookingId: bookings[0].id,
            serviceBookingIds: bookings.map((b) => b.id),
            userId: input.customerId,
            amount: totalAmount,
            method: input.paymentMethod as any,
            country: user.country,
            phoneNumber: input.phoneNumber || user.phoneNumber || undefined,
            email: user.email || undefined,
        });

        if (!paymentResult.success) {
            // Payment initiation failed - remove every booking just created
            await this.bookingRepo.delete(bookings.map((b) => b.id));
            log.warn("Service booking payment failed, removed bookings", {
                bookingIds: bookings.map((b) => b.id),
                message: paymentResult.message,
            });
            throw new Error(paymentResult.message || "Payment initiation failed. Please try again.");
        }

        // 7. Notifications (one per side, covering all dates)
        const bookingNumber = bookings[0].bookingNumber;
        const dateSummary = dates.length > 1 ? `${dates.length} dates starting ${dates[0]}` : dates[0];
        await this.notificationService.notify(
            input.merchantId,
            NotificationType.SERVICE_REQUESTED,
            "New Service Booking! 🛠️",
            `New request for "${input.serviceTitle}" (${dateSummary})${input.serviceAddress ? ` at ${input.serviceAddress}` : ''}.`,
            { bookingId: bookings[0].id, bookingNumber }
        );
        await this.notificationService.notify(
            input.customerId,
            NotificationType.SERVICE_REQUESTED,
            "Booking Submitted! 📋",
            `Your booking #${bookingNumber} for "${input.serviceTitle}" (${dateSummary}) has been submitted. The provider will respond shortly.`,
            { bookingId: bookings[0].id, bookingNumber, jobId: bookings[0].id }
        );

        log.info("Service booking(s) created", { count: bookings.length, bookingNumber, callType: input.callType || "in_call" });

        return {
            booking: bookings[0],
            bookings,
            payment: paymentResult
        };
    }

    /** Refund the customer's money for a booking (wallet credit) when it was paid. */
    private async refundBooking(booking: ServiceBooking, amount: number, reason: string): Promise<void> {
        booking.refundAmount = amount;
        if (booking.paymentStatus === ServicePaymentStatus.PAID && amount > 0) {
            await this.walletService.credit(
                booking.customerId, amount,
                `Refund: booking #${booking.bookingNumber} (${reason})`,
                { bookingId: booking.id, reason }
            );
        }
        if (amount > 0) booking.paymentStatus = ServicePaymentStatus.REFUNDED;
    }

    /**
     * Cancel a booking with the platform cancellation policy:
     * - Customer, more than 3h before start: 100% refund.
     * - Customer, within 3h of start: 70% penalty fee; the fee is paid out to
     *   the provider wallet (late_cancellation_payout), 30% refunded.
     * - Provider (any time): customer always gets a 100% refund.
     */
    async cancelBooking(bookingId: string, userId: string) {
        const booking = await this.bookingRepo.findOne({
            where: { id: bookingId },
            relations: { customer: true, merchant: true }
        });
        if (!booking) throw new Error("Booking not found");
        if (booking.customerId !== userId && booking.merchantId !== userId) {
            throw new Error("Unauthorized to update this booking");
        }
        const terminal = [
            ServiceBookingStatus.COMPLETED, ServiceBookingStatus.CANCELLED, ServiceBookingStatus.DECLINED,
            ServiceBookingStatus.EXPIRED, ServiceBookingStatus.CUSTOMER_CANCELLED, ServiceBookingStatus.PROVIDER_CANCELLED,
        ];
        if (terminal.includes(booking.status)) {
            throw new Error(`Booking is already ${booking.status}`);
        }

        const isCustomer = userId === booking.customerId;
        const total = Math.round((Number(booking.price) + Number(booking.travelFee || 0)) * 100) / 100;
        const startAt = bookingStartAt(booking.preferredDate, booking.preferredTimeSlot);
        const hoursUntilStart = (startAt.getTime() - Date.now()) / 3_600_000;

        let fee = 0;
        if (isCustomer && hoursUntilStart <= CANCEL_FREE_HOURS) {
            fee = Math.round(total * LATE_CANCEL_FEE_RATE * 100) / 100;
        }
        const refund = Math.round((total - fee) * 100) / 100;

        booking.status = isCustomer ? ServiceBookingStatus.CUSTOMER_CANCELLED : ServiceBookingStatus.PROVIDER_CANCELLED;
        booking.cancellationFee = fee;
        await this.refundBooking(booking, refund, isCustomer ? "customer cancellation" : "provider cancellation");

        // The late-cancellation penalty goes 100% to the provider.
        if (fee > 0 && booking.paymentStatus !== ServicePaymentStatus.PENDING) {
            await this.walletService.credit(
                booking.merchantId, fee,
                `Late cancellation payout: booking #${booking.bookingNumber}`,
                { bookingId: booking.id, type: "late_cancellation_payout" }
            );
        }
        await this.bookingRepo.save(booking);

        const other = isCustomer ? booking.merchantId : booking.customerId;
        await this.notificationService.notify(
            other,
            NotificationType.SERVICE_CANCELLED,
            "Booking Cancelled",
            isCustomer
                ? `Booking #${booking.bookingNumber} was cancelled by the customer.${fee > 0 ? ` A late-cancellation payout of ${fee.toFixed(2)} ${booking.currency} was credited to your wallet.` : ""}`
                : `Booking #${booking.bookingNumber} was cancelled by the provider. You have received a full refund.`,
            { bookingId: booking.id }
        );
        await this.notificationService.notify(
            userId,
            NotificationType.SERVICE_CANCELLED,
            "Booking Cancelled",
            isCustomer
                ? (fee > 0
                    ? `You cancelled within ${CANCEL_FREE_HOURS} hours of the appointment. A ${LATE_CANCEL_FEE_RATE * 100}% fee (${fee.toFixed(2)} ${booking.currency}) applied; ${refund.toFixed(2)} ${booking.currency} was refunded to your wallet.`
                    : `Booking #${booking.bookingNumber} cancelled. ${refund.toFixed(2)} ${booking.currency} was refunded to your wallet.`)
                : `You cancelled booking #${booking.bookingNumber}. The customer received a full refund.`,
            { bookingId: booking.id }
        );

        log.info("Service booking cancelled", { bookingId, by: isCustomer ? "customer" : "provider", fee, refund });
        return booking;
    }

    /**
     * Expire unaccepted (requested) bookings that are within 2 hours of their
     * appointment time: release the money hold (full refund) and notify both
     * sides. Run from the scheduled sweep. Returns the number expired.
     */
    async expireStaleBookings(leadHours = EXPIRY_LEAD_HOURS): Promise<number> {
        const candidates = await this.bookingRepo.find({
            where: { status: ServiceBookingStatus.REQUESTED },
            take: 200,
        });
        const cutoff = Date.now() + leadHours * 3_600_000;
        let expired = 0;
        for (const booking of candidates) {
            try {
                const startAt = bookingStartAt(booking.preferredDate, booking.preferredTimeSlot);
                if (startAt.getTime() > cutoff) continue;

                const total = Math.round((Number(booking.price) + Number(booking.travelFee || 0)) * 100) / 100;
                booking.status = ServiceBookingStatus.EXPIRED;
                await this.refundBooking(booking, total, "provider did not respond in time");
                await this.bookingRepo.save(booking);

                await this.notificationService.notify(
                    booking.customerId,
                    NotificationType.SERVICE_CANCELLED,
                    "Booking Expired",
                    `The provider did not accept booking #${booking.bookingNumber} in time. Your payment has been fully refunded.`,
                    { bookingId: booking.id }
                );
                await this.notificationService.notify(
                    booking.merchantId,
                    NotificationType.SERVICE_CANCELLED,
                    "Booking Expired",
                    `Booking #${booking.bookingNumber} expired because it was not accepted before the appointment window.`,
                    { bookingId: booking.id }
                );
                expired++;
            } catch (err) {
                log.warn("Booking expiry failed for one booking", { bookingId: booking.id, error: (err as Error).message });
            }
        }
        return expired;
    }

    async updateStatus(bookingId: string, userId: string, status: ServiceBookingStatus, note?: string) {
        // Cancellations run through the policy engine (refunds + penalty fees).
        if (status === ServiceBookingStatus.CANCELLED
            || status === ServiceBookingStatus.CUSTOMER_CANCELLED
            || status === ServiceBookingStatus.PROVIDER_CANCELLED) {
            return this.cancelBooking(bookingId, userId);
        }

        const booking = await this.bookingRepo.findOne({
            where: { id: bookingId },
            relations: { customer: true, merchant: true }
        });

        if (!booking) throw new Error("Booking not found");

        // Authorization check
        if (booking.customerId !== userId && booking.merchantId !== userId) {
            throw new Error("Unauthorized to update this booking");
        }

        // When merchant accepts, re-check for conflicts (race condition guard)
        if (status === ServiceBookingStatus.ACCEPTED && booking.preferredDate && booking.preferredTimeSlot) {
            const bookingDate = new Date(booking.preferredDate).toISOString().slice(0, 10);
            const [reqStart, reqEnd] = booking.preferredTimeSlot.split('-').map(t => t.trim());

            const conflicts = await this.bookingRepo
                .createQueryBuilder("b")
                .where("b.merchantId = :merchantId", { merchantId: booking.merchantId })
                .andWhere("b.id != :id", { id: bookingId })
                .andWhere("DATE(b.preferredDate) = :date", { date: bookingDate })
                .andWhere("b.status NOT IN (:...terminal)", {
                    terminal: [
                        ServiceBookingStatus.COMPLETED,
                        ServiceBookingStatus.CANCELLED,
                        ServiceBookingStatus.DECLINED,
                    ],
                })
                .getMany();

            const hasConflict = conflicts.some((c) => {
                if (!c.preferredTimeSlot) return false;
                const [exStart, exEnd] = c.preferredTimeSlot.split('-').map(t => t.trim());
                return reqStart < exEnd && exStart < reqEnd;
            });

            if (hasConflict) {
                throw new Error("Cannot accept - another booking already occupies this time slot.");
            }
        }

        const oldStatus = booking.status;
        booking.status = status;

        if (status === ServiceBookingStatus.ACCEPTED) booking.scheduledAt = new Date();
        if (status === ServiceBookingStatus.IN_PROGRESS) booking.startedAt = new Date();
        if (status === ServiceBookingStatus.COMPLETED) booking.completedAt = new Date();
        if (status === ServiceBookingStatus.DECLINED) {
            booking.declinedAt = new Date();
            // The customer paid upfront: declining releases the full amount.
            const total = Math.round((Number(booking.price) + Number(booking.travelFee || 0)) * 100) / 100;
            await this.refundBooking(booking, total, "provider declined");
        }

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
        const bookings = await this.bookingRepo.find({
            where: { customerId },
            relations: { product: true },
            order: { createdAt: "DESC" }
        });
        if (bookings.length === 0) return bookings;

        // For in-call bookings the customer travels to the provider, so attach
        // the provider's business address (one profile fetch per merchant).
        const merchantIds = [...new Set(bookings.map((b) => b.merchantId))];
        const profiles = await this.merchantProfileRepo.find({ where: { userId: In(merchantIds) } });
        const addressByMerchant = new Map(profiles.map((p) => [p.userId, p.address]));
        return bookings.map((b) => ({
            ...b,
            providerAddress: addressByMerchant.get(b.merchantId) || null,
        }));
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

    // ── Booking chat (customer <-> provider) ────────────────────────

    private get messageRepo() {
        const { ServiceBookingMessage } = require("../models/service-booking-message");
        return AppDataSource.getRepository(ServiceBookingMessage);
    }

    async getMessages(bookingId: string, userId: string) {
        const booking = await this.bookingRepo.findOne({ where: { id: bookingId } });
        if (!booking) throw new Error("Booking not found");
        if (booking.customerId !== userId && booking.merchantId !== userId) {
            throw new Error("Unauthorized to view this booking");
        }
        const messages = await this.messageRepo.find({ where: { bookingId }, order: { createdAt: "ASC" } });
        return { booking, messages };
    }

    async sendMessage(bookingId: string, userId: string, text: string) {
        const booking = await this.bookingRepo.findOne({ where: { id: bookingId } });
        if (!booking) throw new Error("Booking not found");
        if (booking.customerId !== userId && booking.merchantId !== userId) {
            throw new Error("Unauthorized to message on this booking");
        }
        const senderRole = userId === booking.customerId ? "customer" : "provider";
        const message = await this.messageRepo.save(this.messageRepo.create({
            bookingId, senderId: userId, senderRole, text: text.trim().slice(0, 2000),
        }));

        const recipientId = senderRole === "customer" ? booking.merchantId : booking.customerId;
        this.notificationService.notify(
            recipientId,
            NotificationType.MESSAGE_RECEIVED,
            senderRole === "customer" ? "New message from your customer 💬" : "New message from your provider 💬",
            `${booking.serviceTitle}: ${message.text.slice(0, 120)}`,
            { bookingId, screen: "booking-chat" }
        ).catch(() => {});

        return message;
    }
}
