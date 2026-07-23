import { AppDataSource } from "../db/data-source";
import { ScheduledRide, ScheduledRideStatus, ScheduledPaymentStatus } from "../models/scheduled-ride";
import { Ride, RideType, PaymentMethod, PaymentStatus } from "../models/ride";
import { VehicleType } from "../models/vehicle-pricing";
import { PaymentMethodType, PaymentRecordStatus } from "../models/payment";
import { PaymentService, PaymentResult } from "./payment/payment-service";
import { FareService } from "./fare-service";
import { RideService } from "./ride-service";
import { createServiceLogger } from "../utils/logger";
import { LessThanOrEqual } from "typeorm";

const log = createServiceLogger("ScheduledRideService");

// How far before the scheduled time the real ride is created and broadcast to drivers.
const DISPATCH_LEAD_MS = 10 * 60 * 1000;
// Cancel for free up to this many hours before the scheduled time; cancelling later
// (or a no-show) keeps LATE_CANCEL_FEE_RATE of the fare to compensate the driver. Mirrors
// the service-booking policy and the copy shown on the scheduling screen.
const CANCEL_FREE_HOURS = 3;
const LATE_CANCEL_FEE_RATE = 0.7;

export interface CreateScheduledRideInput {
    customerId: string;
    pickupAddress: string;
    pickupLat: number;
    pickupLng: number;
    dropoffAddress: string;
    dropoffLat: number;
    dropoffLng: number;
    vehicleType: VehicleType;
    distanceKm: number;
    durationMin: number;
    scheduledAt: string | Date;
    paymentMethod: string;
    country?: string;
    email?: string;
    phoneNumber?: string;
    notes?: string;
}

export interface CreateScheduledRideResult {
    scheduledRide: ScheduledRide;
    payment?: PaymentResult;
}

const METHOD_MAP: Record<string, PaymentMethodType> = {
    cash: PaymentMethodType.CASH,
    momo: PaymentMethodType.MOMO,
    card: PaymentMethodType.CARD,
    wallet: PaymentMethodType.WALLET,
};

export class ScheduledRideService {
    private repo = AppDataSource.getRepository(ScheduledRide);
    private rideRepo = AppDataSource.getRepository(Ride);
    private paymentService = new PaymentService();
    private fareService = new FareService();
    private rideService = new RideService();

    /**
     * Create a scheduled ride. Scheduled rides are PREPAID (card/momo/wallet): the
     * 3-hour free-cancellation window and the late-cancel / no-show fee can only be
     * enforced against money collected up front, so cash is rejected. momo/card return
     * an authorization URL the app opens; the webhook marks the ride paid. Wallet
     * settles immediately.
     */
    async create(input: CreateScheduledRideInput): Promise<CreateScheduledRideResult> {
        const country = input.country || "GH";
        const method = METHOD_MAP[String(input.paymentMethod || "").toLowerCase()];
        if (!method || method === PaymentMethodType.CASH) {
            throw new Error("Scheduled rides must be prepaid by card or mobile money.");
        }

        // Recompute the fare server-side so the charged amount is authoritative.
        const fare = await this.fareService.calculateFare(
            input.vehicleType,
            input.distanceKm,
            input.durationMin,
            undefined,
            country
        );

        const scheduled = this.repo.create({
            customerId: input.customerId,
            type: RideType.RIDE,
            pickupAddress: input.pickupAddress,
            pickupLat: input.pickupLat,
            pickupLng: input.pickupLng,
            dropoffAddress: input.dropoffAddress,
            dropoffLat: input.dropoffLat,
            dropoffLng: input.dropoffLng,
            vehicleType: input.vehicleType,
            distanceKm: input.distanceKm,
            durationMin: input.durationMin,
            scheduledAt: new Date(input.scheduledAt),
            estimatedFare: fare.finalFare,
            currency: fare.currency,
            paymentMethod: input.paymentMethod,
            // Every scheduled ride is prepaid, so it always starts PENDING until the
            // charge (or wallet debit) confirms.
            paymentStatus: ScheduledPaymentStatus.PENDING,
            status: ScheduledRideStatus.SCHEDULED,
            rideId: null,
            notes: input.notes || null,
        });
        const saved = await this.repo.save(scheduled);
        log.info("Scheduled ride created", { id: saved.id, method, scheduledAt: saved.scheduledAt });

        const payment = await this.paymentService.processScheduledRidePayment({
            scheduledRideId: saved.id,
            userId: input.customerId,
            amount: fare.finalFare,
            method,
            country,
            email: input.email,
            phoneNumber: input.phoneNumber,
        });

        // Wallet settles synchronously; reflect it immediately.
        if (payment.status === PaymentRecordStatus.SUCCESS) {
            saved.paymentStatus = ScheduledPaymentStatus.PAID;
            await this.repo.save(saved);
        }

        return { scheduledRide: saved, payment };
    }

    /** Upcoming + past scheduled rides for a customer (newest scheduled first). */
    async listForCustomer(customerId: string): Promise<ScheduledRide[]> {
        return this.repo.find({
            where: { customerId },
            order: { scheduledAt: "ASC" },
        });
    }

    /**
     * Cancel a scheduled ride the customer owns and refund the prepayment to the wallet.
     * Cancelling more than CANCEL_FREE_HOURS before the scheduled time is a full refund;
     * within the window (a late cancellation / no-show) keeps LATE_CANCEL_FEE_RATE of the
     * fare to compensate the driver and refunds the rest. Only rides not yet dispatched
     * can be cancelled here.
     */
    async cancel(id: string, customerId: string): Promise<{ refunded: number; feeKept: number; late: boolean }> {
        const ride = await this.repo.findOne({ where: { id, customerId } });
        if (!ride) throw new Error("Scheduled ride not found");
        if (ride.status === ScheduledRideStatus.DISPATCHED) {
            throw new Error("Ride already dispatched to a driver");
        }
        if (ride.status === ScheduledRideStatus.CANCELLED) {
            return { refunded: 0, feeKept: 0, late: false };
        }

        const hoursToPickup = (new Date(ride.scheduledAt).getTime() - Date.now()) / 3_600_000;
        const late = hoursToPickup < CANCEL_FREE_HOURS;

        let refunded = 0;
        let feeKept = 0;
        if (ride.paymentStatus === ScheduledPaymentStatus.PAID) {
            const paid = Number(ride.estimatedFare) || 0;
            const refundAmount = late
                ? Math.round(paid * (1 - LATE_CANCEL_FEE_RATE) * 100) / 100
                : paid;
            refunded = await this.paymentService.refundScheduledRidePayment(ride.id, refundAmount);
            feeKept = Math.round((paid - refunded) * 100) / 100;
            ride.paymentStatus = ScheduledPaymentStatus.REFUNDED;
        }
        ride.status = ScheduledRideStatus.CANCELLED;
        await this.repo.save(ride);
        log.info("Scheduled ride cancelled", { id, refunded, feeKept, late });
        return { refunded, feeKept, late };
    }

    /**
     * Convert due scheduled rides into real rides and broadcast them to drivers. Run
     * on a timer. Prepaid rides carry their PAID status onto the created ride so the
     * customer is not charged again.
     */
    async dispatchDue(): Promise<number> {
        const cutoff = new Date(Date.now() + DISPATCH_LEAD_MS);
        const due = await this.repo.find({
            where: { status: ScheduledRideStatus.SCHEDULED, scheduledAt: LessThanOrEqual(cutoff) },
        });
        if (due.length === 0) return 0;

        let dispatched = 0;
        for (const s of due) {
            try {
                const ride = await this.rideService.requestRide({
                    customerId: s.customerId,
                    type: s.type,
                    pickupAddress: s.pickupAddress,
                    pickupLat: s.pickupLat,
                    pickupLng: s.pickupLng,
                    dropoffAddress: s.dropoffAddress,
                    dropoffLat: s.dropoffLat,
                    dropoffLng: s.dropoffLng,
                    vehicleType: s.vehicleType,
                    distanceKm: s.distanceKm,
                    durationMin: s.durationMin,
                    country: s.currency === "NGN" ? "NG" : s.currency === "USD" ? "US" : "GH",
                });

                // Carry the prepayment forward so the ride is not charged again.
                if (s.paymentStatus === ScheduledPaymentStatus.PAID) {
                    await this.rideRepo.update(
                        { id: ride.id },
                        {
                            paymentStatus: PaymentStatus.PAID,
                            paymentMethod: (s.paymentMethod as PaymentMethod) || null,
                        }
                    );
                }

                s.rideId = ride.id;
                s.status = ScheduledRideStatus.DISPATCHED;
                await this.repo.save(s);
                dispatched++;
                log.info("Scheduled ride dispatched", { scheduledId: s.id, rideId: ride.id });
            } catch (e) {
                log.error("Failed to dispatch scheduled ride", { scheduledId: s.id, error: (e as Error).message });
            }
        }
        return dispatched;
    }
}
