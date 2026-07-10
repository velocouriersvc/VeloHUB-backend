import { AppDataSource } from "../db/data-source";
import { IsNull, MoreThan } from "typeorm";
import { Ride, RideType, RideStatus, PaymentMethod, PaymentStatus, CancelledBy } from "../models/ride";
import { RideStop } from "../models/ride-stop";
import { RideSharedContact } from "../models/ride-shared-contact";
import { VehicleType } from "../models/vehicle-pricing";
import { PaymentMethodType } from "../models/payment";
import { FareService, FareBreakdown } from "./fare-service";
import { PricingVertical } from "../config/pricing";
import { DriverMatchService, MatchedDriver } from "./driver-match-service";
import { PaymentService } from "./payment/payment-service";
import { NotificationService } from "./notification-service";
import { NotificationType } from "../models/notification";
import { RedisLocationService } from "./redis-location-service";
import { PreludeService } from "./prelude-service";
import { createServiceLogger } from "../utils/logger";
import { rideEventsTotal } from "../utils/metrics";
import { PlatformSettings } from "../models/platform-settings";
import { SettlementService } from "./settlement-service";
import { Rating } from "../models/rating";
import { PickupCodeService } from "./pickup-code-service";
import { emitRideEvent } from "../socket-gateway";

const log = createServiceLogger("RideService");

/** Great-circle distance in km (used for the loose driver proximity filter). */
function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371;
    const toRad = (d: number) => (d * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export interface RideRequest {
    customerId: string;
    type: RideType;
    pickupAddress: string;
    pickupLat: number;
    pickupLng: number;
    dropoffAddress: string;
    dropoffLat: number;
    dropoffLng: number;
    vehicleType: VehicleType;
    distanceKm: number;
    durationMin: number;
    passengerCount?: number;
    promoCode?: string;
    country?: string;
    requireCode?: boolean;
    stops?: Array<{ address: string; lat: number; lng: number; stopOrder: number }>;
    sharedContacts?: Array<{ name: string; phone: string }>;
}

export interface RideEstimate {
    fareBreakdown: FareBreakdown;
    availableDrivers: number;
    estimatedPickupMin: number;
}

/**
 * Forward progress rank for ride lifecycle statuses. Lets the driver transitions be
 * idempotent: re-tapping "I've arrived" or firing enroute after arriving is a safe
 * no-op instead of a hard error, which is what left drivers stuck on "En Route".
 * ACCEPTED / AWAITING_PAYMENT / PAID share rank 1 (payment settles in parallel).
 */
const STATUS_RANK: Record<RideStatus, number> = {
    [RideStatus.SEARCHING]: 0,
    [RideStatus.ACCEPTED]: 1,
    [RideStatus.AWAITING_PAYMENT]: 1,
    [RideStatus.PAID]: 1,
    [RideStatus.DRIVER_ENROUTE]: 2,
    [RideStatus.ARRIVED]: 3,
    [RideStatus.ONGOING]: 4,
    [RideStatus.COMPLETED]: 5,
    [RideStatus.CANCELLED]: -1,
};

export class RideService {
    private rideRepo = AppDataSource.getRepository(Ride);
    private stopRepo = AppDataSource.getRepository(RideStop);
    private contactRepo = AppDataSource.getRepository(RideSharedContact);

    private fareService: FareService;
    private driverMatchService: DriverMatchService;
    private paymentService: PaymentService;
    private notificationService: NotificationService;
    private redisLocation: RedisLocationService;
    private preludeService: PreludeService;
    private settlementService: SettlementService;

    constructor() {
        this.fareService = new FareService();
        this.driverMatchService = new DriverMatchService();
        this.paymentService = new PaymentService();
        this.notificationService = new NotificationService();
        this.redisLocation = new RedisLocationService();
        this.preludeService = new PreludeService();
        this.settlementService = new SettlementService();
    }

    // ── Fare Estimate ──

    /**
     * Get a fare estimate before requesting a ride
     */
    async getFareEstimate(
        vehicleType: VehicleType,
        distanceKm: number,
        durationMin: number,
        pickupLat: number,
        pickupLng: number,
        promoCode?: string,
        country?: string,
        vertical: PricingVertical = PricingVertical.RIDES
    ): Promise<RideEstimate> {
        const fareBreakdown = await this.fareService.calculateFare(
            vehicleType,
            distanceKm,
            durationMin,
            promoCode,
            country || "GH",
            vertical
        );

        // Check how many drivers are nearby
        const nearbyDrivers = await this.driverMatchService.findDrivers(
            pickupLat,
            pickupLng,
            vehicleType
        );

        // Rough ETA: closest driver distance / avg speed (30 km/h in city)
        const estimatedPickupMin = nearbyDrivers.length > 0
            ? Math.max(Math.round((nearbyDrivers[0].distanceKm / 30) * 60), 2)
            : 0;

        return {
            fareBreakdown,
            availableDrivers: nearbyDrivers.length,
            estimatedPickupMin,
        };
    }

    /**
     * Get all vehicle pricing options with estimates
     */
    async getAllFareEstimates(
        distanceKm: number,
        durationMin: number,
        pickupLat: number,
        pickupLng: number,
        promoCode?: string,
        country?: string,
        vertical: PricingVertical = PricingVertical.RIDES
    ): Promise<RideEstimate[]> {
        const vehicleTypes = Object.values(VehicleType);
        const estimates: RideEstimate[] = [];

        for (const vt of vehicleTypes) {
            try {
                const estimate = await this.getFareEstimate(
                    vt,
                    distanceKm,
                    durationMin,
                    pickupLat,
                    pickupLng,
                    promoCode,
                    country,
                    vertical
                );
                estimates.push(estimate);
            } catch {
                // Skip vehicle types without pricing
            }
        }

        return estimates;
    }

    /**
     * Rides a driver can pick up right now: recent, still-searching, unassigned.
     * Deliberately loose (no vehicle-type / approval / online gating) so requests
     * reliably reach drivers even if the real-time broadcast missed them. When the
     * driver sends a location we apply a generous proximity filter.
     */
    async getAvailableRides(lat?: number, lng?: number, radiusKm = 50): Promise<Ride[]> {
        const since = new Date(Date.now() - 5 * 60 * 1000); // only fresh requests
        const rides = await this.rideRepo.find({
            where: { status: RideStatus.SEARCHING, driverId: IsNull(), createdAt: MoreThan(since) },
            order: { createdAt: "DESC" },
            take: 20,
        });
        if (lat == null || lng == null || Number.isNaN(lat) || Number.isNaN(lng)) return rides;
        return rides.filter((r) => haversineKm(lat, lng, Number(r.pickupLat), Number(r.pickupLng)) <= radiusKm);
    }

    // ── Ride Lifecycle ──

    /**
     * Step 1: Customer requests a ride
     */
    async requestRide(request: RideRequest): Promise<Ride> {
        // Resolve country
        const country = request.country || "GH";

        // Calculate fare. Package/courier deliveries use the PACKAGE vertical
        // (higher base for loading/unloading); passenger rides use RIDES.
        const vertical = request.type === RideType.DELIVERY
            ? PricingVertical.PACKAGE
            : PricingVertical.RIDES;
        const fareBreakdown = await this.fareService.calculateFare(
            request.vehicleType,
            request.distanceKm,
            request.durationMin,
            request.promoCode,
            country,
            vertical
        );

        // Create ride record
        const ride = this.rideRepo.create({
            customerId: request.customerId,
            type: request.type,
            pickupAddress: request.pickupAddress,
            pickupLat: request.pickupLat,
            pickupLng: request.pickupLng,
            dropoffAddress: request.dropoffAddress,
            dropoffLat: request.dropoffLat,
            dropoffLng: request.dropoffLng,
            vehicleType: request.vehicleType,
            currency: fareBreakdown.currency,
            distanceKm: request.distanceKm,
            durationMin: request.durationMin,
            baseFare: fareBreakdown.baseFare,
            subtotal: fareBreakdown.subtotal,
            surgeMultiplier: fareBreakdown.surgeMultiplier,
            surgeAmount: fareBreakdown.surgeAmount,
            riderServiceFee: fareBreakdown.riderServiceFee,
            discountPercent: fareBreakdown.discountPercent,
            discountAmount: fareBreakdown.discountAmount,
            finalFare: fareBreakdown.finalFare,
            // Store the 15% commission portion only; riderServiceFee is tracked
            // separately so analytics (commission + riderServiceFee) don't double-count.
            commission: fareBreakdown.rideCommission,
            driverPayout: fareBreakdown.driverPayout,
            passengerCount: request.passengerCount || 1,
            requireCode: !!request.requireCode,
            pickupCode: request.requireCode ? new PickupCodeService().generate() : null,
            status: RideStatus.SEARCHING,
        });

        const savedRide = await this.rideRepo.save(ride);
        log.info("Ride created", { rideId: savedRide.id, vehicleType: request.vehicleType, status: RideStatus.SEARCHING });
        rideEventsTotal.inc({ event: "requested" });

        // Save stops if any
        if (request.stops && request.stops.length > 0) {
            const stops = request.stops.map((s) =>
                this.stopRepo.create({
                    rideId: savedRide.id,
                    address: s.address,
                    lat: s.lat,
                    lng: s.lng,
                    stopOrder: s.stopOrder,
                })
            );
            await this.stopRepo.save(stops);
        }

        // Save shared contacts and notify them
        if (request.sharedContacts && request.sharedContacts.length > 0) {
            const contacts = request.sharedContacts.map((c) =>
                this.contactRepo.create({
                    rideId: savedRide.id,
                    name: c.name,
                    phone: c.phone,
                })
            );
            await this.contactRepo.save(contacts);
        }

        // Store ride tracking in Redis
        await this.redisLocation.setRideTracking(savedRide.id, {
            status: RideStatus.SEARCHING,
            customerId: request.customerId,
            pickupLat: request.pickupLat.toString(),
            pickupLng: request.pickupLng.toString(),
        });

        // Find and broadcast to nearby drivers
        const drivers = await this.driverMatchService.findDrivers(
            request.pickupLat,
            request.pickupLng,
            request.vehicleType
        );

        if (drivers.length > 0) {
            const driverUserIds = drivers.map((d) => d.userId);
            await this.driverMatchService.broadcastRideRequest(
                savedRide.id,
                request.pickupAddress,
                driverUserIds,
                {
                    rideId: savedRide.id,
                    type: savedRide.type,
                    pickupAddress: request.pickupAddress,
                    dropoffAddress: request.dropoffAddress,
                    pickupLat: request.pickupLat,
                    pickupLng: request.pickupLng,
                    dropoffLat: request.dropoffLat,
                    dropoffLng: request.dropoffLng,
                    fare: savedRide.finalFare,
                    currency: savedRide.currency,
                    distanceKm: request.distanceKm,
                    durationMin: request.durationMin,
                    vehicleType: request.vehicleType,
                }
            );
        }

        // Real-time: emit ride:searching event
        emitRideEvent(savedRide.id, "ride:status", {
            rideId: savedRide.id,
            status: RideStatus.SEARCHING,
            driversNotified: drivers.length,
        });

        // Notify customer - ride request confirmed, searching for drivers
        await this.notificationService.notify(
            request.customerId,
            NotificationType.RIDE_REQUESTED,
            "Ride Requested! 🔍",
            drivers.length > 0
                ? `Looking for a driver near you. ${drivers.length} driver${drivers.length > 1 ? "s" : ""} notified.`
                : "Looking for available drivers in your area...",
            { rideId: savedRide.id, screen: "rides", deepLink: `velohub://rides?rideId=${savedRide.id}` }
        );

        // Auto-cancel ride after 3 minutes if no driver accepts
        setTimeout(async () => {
            try {
                const ride = await this.rideRepo.findOne({ where: { id: savedRide.id } });
                if (ride && ride.status === RideStatus.SEARCHING) {
                    log.info("Auto-cancelling ride due to no driver acceptance", { rideId: savedRide.id });
                    await this.cancelRide(savedRide.id, CancelledBy.SYSTEM, "No driver available");
                    
                    // Emit cancellation event
                    emitRideEvent(savedRide.id, "ride:status", {
                        rideId: savedRide.id,
                        status: RideStatus.CANCELLED,
                        cancelledBy: CancelledBy.SYSTEM,
                        reason: "No driver available",
                    });
                }
            } catch (error) {
                log.error("Error auto-cancelling ride", { rideId: savedRide.id, error: (error as Error).message });
            }
        }, 180000); // 3 minutes

        return savedRide;
    }

    /**
     * Step 2: Driver accepts a ride
     */
    async acceptRide(rideId: string, driverUserId: string, driverName: string): Promise<Ride> {
        const ride = await this.getRideOrFail(rideId);

        if (ride.status !== RideStatus.SEARCHING) {
            throw new Error("Ride is no longer available");
        }

        ride.driverId = driverUserId;
        ride.status = RideStatus.ACCEPTED;
        ride.acceptedAt = new Date();

        const updatedRide = await this.rideRepo.save(ride);

        // Mark driver as busy
        await this.redisLocation.setDriverStatus(driverUserId, "busy");
        log.info("Ride accepted", { rideId, driverUserId });
        rideEventsTotal.inc({ event: "accepted" });

        // Update ride tracking
        await this.redisLocation.setRideTracking(rideId, {
            status: RideStatus.ACCEPTED,
            driverId: driverUserId,
        });

        // Clean up broadcast
        await this.redisLocation.removeBroadcast(rideId);

        // Notify customer
        await this.notificationService.notifyRideAccepted(
            ride.customerId,
            driverName,
            rideId
        );

        // Real-time: emit ride:accepted
        emitRideEvent(rideId, "ride:status", {
            rideId,
            status: RideStatus.ACCEPTED,
            driverId: driverUserId,
            driverName,
        });

        return updatedRide;
    }

    /**
     * Step 3: Set payment method and process payment (for momo/wallet)
     */
    async setPaymentMethod(
        rideId: string,
        paymentMethod: PaymentMethod,
        phoneNumber?: string,
        email?: string
    ): Promise<Ride> {
        const ride = await this.getRideOrFail(rideId);

        if (ride.status !== RideStatus.ACCEPTED) {
            throw new Error("Ride must be accepted before setting payment");
        }

        ride.paymentMethod = paymentMethod;
        ride.status = RideStatus.AWAITING_PAYMENT;

        await this.rideRepo.save(ride);

        // Process payment based on method
        if (paymentMethod === PaymentMethod.MOMO || paymentMethod === PaymentMethod.WALLET || paymentMethod === PaymentMethod.CARD) {
            const methodMap: Record<string, PaymentMethodType> = {
                [PaymentMethod.MOMO]: PaymentMethodType.MOMO,
                [PaymentMethod.WALLET]: PaymentMethodType.WALLET,
                [PaymentMethod.CARD]: PaymentMethodType.CARD,
            };

            const result = await this.paymentService.processRidePayment({
                rideId,
                userId: ride.customerId,
                amount: Number(ride.finalFare),
                riderServiceFee: Number(ride.riderServiceFee || 0),
                method: methodMap[paymentMethod],
                phoneNumber,
                email,
            });

            if (!result.success) {
                // Payment initiation failed - revert ride status back to accepted
                ride.status = RideStatus.ACCEPTED;
                ride.paymentMethod = null as any;
                await this.rideRepo.save(ride);
                log.warn("Ride payment initiation failed, reverted to ACCEPTED", {
                    rideId,
                    message: result.message,
                });
                throw new Error(result.message || "Payment initiation failed. Please try again.");
            }

            if (result.success && paymentMethod === PaymentMethod.WALLET) {
                // Wallet payment is instant - mark ride as paid
                ride.paymentStatus = PaymentStatus.PAID;
                ride.status = RideStatus.PAID;
                ride.paidAt = new Date();
                await this.rideRepo.save(ride);

                // Notify driver
                if (ride.driverId) {
                    await this.notificationService.notifyPaymentReceived(
                        ride.driverId,
                        Number(ride.finalFare),
                        rideId
                    );
                }
            }

            // Expose the Paystack authorization URL (card / momo) so the client can
            // open it to complete payment. Attached as a transient field on the ride.
            const finalRide = await this.getRideOrFail(rideId);
            (finalRide as any).authorizationUrl = result.authorizationUrl;
            return finalRide;
        }

        // Cash - mark as paid (driver collects on delivery)
        ride.paymentStatus = PaymentStatus.PAID;
        ride.status = RideStatus.PAID;
        ride.paidAt = new Date();
        await this.rideRepo.save(ride);

        return this.getRideOrFail(rideId);
    }

    /**
     * Callback: Momo payment confirmed via webhook
     */
    async confirmMomoPayment(rideId: string): Promise<Ride> {
        const ride = await this.getRideOrFail(rideId);

        ride.paymentStatus = PaymentStatus.PAID;
        ride.status = RideStatus.PAID;
        ride.paidAt = new Date();
        const updated = await this.rideRepo.save(ride);

        // Notify driver
        if (ride.driverId) {
            await this.notificationService.notifyPaymentReceived(
                ride.driverId,
                Number(ride.finalFare),
                rideId
            );
        }

        return updated;
    }

    /**
     * Step 4: Driver en route to pickup
     */
    async driverEnroute(rideId: string, driverName: string): Promise<Ride> {
        const ride = await this.getRideOrFail(rideId);

        // Idempotent: if the ride is already enroute or further along, do nothing (the
        // nav screen fires this on mount). Only a searching/cancelled ride is invalid.
        if (STATUS_RANK[ride.status] < 0) throw new Error("Ride is cancelled");
        if (STATUS_RANK[ride.status] >= STATUS_RANK[RideStatus.DRIVER_ENROUTE]) return ride;
        if (STATUS_RANK[ride.status] < STATUS_RANK[RideStatus.ACCEPTED]) {
            throw new Error("Ride is not ready for the driver to depart");
        }

        ride.status = RideStatus.DRIVER_ENROUTE;
        const updated = await this.rideRepo.save(ride);
        log.info("Driver en route to pickup", { rideId });

        await this.redisLocation.setRideTracking(rideId, { status: RideStatus.DRIVER_ENROUTE });
        await this.notificationService.notifyDriverEnroute(ride.customerId, driverName, rideId);

        emitRideEvent(rideId, "ride:status", { rideId, status: RideStatus.DRIVER_ENROUTE, driverName });

        return updated;
    }

    /**
     * Step 5: Driver arrived at pickup
     */
    async driverArrived(rideId: string, driverName: string): Promise<Ride> {
        const ride = await this.getRideOrFail(rideId);

        // Idempotent: already arrived (or on/after the trip) is a safe no-op, so a
        // re-tap or an out-of-order call never throws "not in a state to mark arrived".
        if (STATUS_RANK[ride.status] < 0) throw new Error("Ride is cancelled");
        if (STATUS_RANK[ride.status] >= STATUS_RANK[RideStatus.ARRIVED]) return ride;
        if (STATUS_RANK[ride.status] < STATUS_RANK[RideStatus.ACCEPTED]) {
            throw new Error("Ride is not in a state to mark arrived");
        }

        ride.status = RideStatus.ARRIVED;
        const updated = await this.rideRepo.save(ride);
        log.info("Driver arrived at pickup", { rideId });

        await this.redisLocation.setRideTracking(rideId, { status: RideStatus.ARRIVED });
        await this.notificationService.notifyDriverArrived(ride.customerId, driverName, rideId);

        emitRideEvent(rideId, "ride:status", { rideId, status: RideStatus.ARRIVED, driverName });

        return updated;
    }

    /**
     * Step 6: Start the ride
     */
    async startRide(rideId: string, code?: string): Promise<Ride> {
        const ride = await this.getRideOrFail(rideId);

        // Idempotent: already ongoing/completed is a no-op. Allow starting from any
        // active pre-trip state (arrived normally, or enroute/accepted if a step was
        // skipped) so the trip is never blocked from beginning.
        if (STATUS_RANK[ride.status] < 0) throw new Error("Ride is cancelled");
        if (STATUS_RANK[ride.status] >= STATUS_RANK[RideStatus.ONGOING]) return ride;
        if (STATUS_RANK[ride.status] < STATUS_RANK[RideStatus.ACCEPTED]) {
            throw new Error("Driver must have arrived at pickup");
        }

        // If the rider opted into a safety code, the driver must enter it to start.
        if (ride.requireCode && ride.pickupCode) {
            if (!code || code.trim().toUpperCase() !== ride.pickupCode.toUpperCase()) {
                throw new Error("Incorrect pickup code");
            }
        }

        ride.status = RideStatus.ONGOING;
        ride.startedAt = new Date();
        const updated = await this.rideRepo.save(ride);
        log.info("Ride started", { rideId });

        await this.redisLocation.setRideTracking(rideId, { status: RideStatus.ONGOING });
        await this.notificationService.notifyRideStarted(ride.customerId, rideId);

        emitRideEvent(rideId, "ride:status", { rideId, status: RideStatus.ONGOING });

        // Notify shared contacts that ride has started
        await this.notifySharedContacts(rideId, ride);

        return updated;
    }

    /**
     * Step 7: Complete the ride
     */
    async completeRide(rideId: string, completedBy: string = "system", role: "driver" | "system" | "admin" = "system"): Promise<Ride> {
        const ride = await this.getRideOrFail(rideId);

        // Idempotent: a ride already completed is returned as-is (never settle twice).
        if (ride.status === RideStatus.COMPLETED) return ride;
        if (ride.status !== RideStatus.ONGOING) {
            throw new Error("Ride must be ongoing to complete");
        }

        // Use SettlementService to handle everything:
        // - Calculate final commission and earnings
        // - Update ride status and timestamps
        // - Credit/Debit wallets
        // - Send notifications
        await this.settlementService.settleRide(rideId, completedBy, role);

        // Fetch refreshed ride
        const updated = await this.getRideOrFail(rideId);
        
        // Clean up Redis
        await this.redisLocation.removeRideTracking(rideId);
        if (updated.driverId) {
            await this.redisLocation.setDriverStatus(updated.driverId, "online");
        }

        emitRideEvent(rideId, "ride:status", { rideId, status: RideStatus.COMPLETED });

        return updated;
    }

    /**
     * Cancel a ride
     */
    async cancelRide(
        rideId: string,
        cancelledBy: CancelledBy,
        reason?: string,
        fullRefund = false
    ): Promise<Ride> {
        const ride = await this.getRideOrFail(rideId);

        // Can't cancel completed or already cancelled rides
        if (ride.status === RideStatus.COMPLETED || ride.status === RideStatus.CANCELLED) {
            throw new Error("Cannot cancel this ride");
        }

        ride.status = RideStatus.CANCELLED;
        ride.cancelledBy = cancelledBy;
        ride.cancelReason = reason || null;
        ride.cancelledAt = new Date();
        const updated = await this.rideRepo.save(ride);
        log.info("Ride cancelled", { rideId, cancelledBy, reason: reason || "none" });
        rideEventsTotal.inc({ event: "cancelled" });

        // Notify the other party
        const cancelledByLabel = cancelledBy === CancelledBy.CUSTOMER ? "Customer" : 
                                cancelledBy === CancelledBy.DRIVER ? "Driver" : "System";
        const cancelMessage = reason || `Ride cancelled by ${cancelledByLabel}`;

        if (cancelledBy === CancelledBy.CUSTOMER && ride.driverId) {
            await this.notificationService.notifyRideCancelled(ride.driverId, cancelMessage, rideId);
        } else if (cancelledBy === CancelledBy.DRIVER) {
            await this.notificationService.notifyRideCancelled(ride.customerId, cancelMessage, rideId);
        } else if (cancelledBy === CancelledBy.SYSTEM) {
            // Notify customer about system cancellation
            await this.notificationService.notifyRideCancelled(ride.customerId, cancelMessage, rideId);
        }

        // Full refund (e.g. driver's vehicle/plate did not match). Refunds any
        // successful prepayment to the customer's wallet; cash rides refund nothing.
        if (fullRefund && cancelledBy === CancelledBy.CUSTOMER) {
            try {
                const refunded = await this.paymentService.refundRidePayment(rideId);
                if (refunded > 0) {
                    await this.notificationService.notifyRideCancelled(
                        ride.customerId,
                        `You were fully refunded ${refunded} to your wallet for the cancelled ride.`,
                        rideId
                    );
                }
            } catch (err) {
                log.warn("Ride refund failed (will need manual handling)", { rideId, error: (err as Error).message });
            }
        }

        // Clean up Redis
        await this.redisLocation.removeRideTracking(rideId);
        await this.redisLocation.removeBroadcast(rideId);
        if (ride.driverId) {
            await this.redisLocation.setDriverStatus(ride.driverId, "online");
        }

        emitRideEvent(rideId, "ride:status", { rideId, status: RideStatus.CANCELLED, cancelledBy, reason });

        return updated;
    }

    // ── Queries ──

    /**
     * Get ride by ID with relations
     */
    async getRideById(rideId: string): Promise<Ride | null> {
        return this.rideRepo.findOne({
            where: { id: rideId },
            relations: ["stops", "sharedContacts", "driver", "driver.driverProfile"],
        });
    }

    /**
     * Get customer's ride history
     */
    async getCustomerRides(
        customerId: string,
        limit: number = 20,
        offset: number = 0
    ): Promise<{ rides: Ride[]; total: number }> {
        const [rides, total] = await this.rideRepo.findAndCount({
            where: { customerId },
            relations: ["driver", "driver.driverProfile"],
            order: { createdAt: "DESC" },
            take: limit,
            skip: offset,
        });

        return { rides, total };
    }

    /**
     * Get driver's ride history
     */
    async getDriverRides(
        driverId: string,
        limit: number = 20,
        offset: number = 0
    ): Promise<{ rides: Ride[]; total: number }> {
        const [rides, total] = await this.rideRepo.findAndCount({
            where: { driverId },
            relations: ["driver", "driver.driverProfile"],
            order: { createdAt: "DESC" },
            take: limit,
            skip: offset,
        });

        return { rides, total };
    }

    /**
     * Get customer's active ride (not completed/cancelled)
     */
    async getActiveRide(customerId: string): Promise<Ride | null> {
        return this.rideRepo
            .createQueryBuilder("ride")
            .where("ride.customerId = :customerId", { customerId })
            .andWhere("ride.status NOT IN (:...finalStatuses)", {
                finalStatuses: [RideStatus.COMPLETED, RideStatus.CANCELLED],
            })
            .leftJoinAndSelect("ride.stops", "stops")
            .leftJoinAndSelect("ride.sharedContacts", "contacts")
            .leftJoinAndSelect("ride.driver", "driver")
            .leftJoinAndSelect("driver.driverProfile", "driverProfile")
            .getOne();
    }

    /**
     * Real, public driver stats shown to the customer on an active ride (replaces the
     * hardcoded 4.9 / "1,242 rides"). Average star rating + count of completed trips.
     */
    async getDriverPublicStats(driverUserId: string): Promise<{ rating: number; ratingCount: number; completedTrips: number }> {
        const agg = await this.rideRepo.manager
            .getRepository(Rating)
            .createQueryBuilder("r")
            .select("COALESCE(AVG(r.rating), 0)", "avg")
            .addSelect("COUNT(r.id)", "cnt")
            .where("r.driverId = :driverUserId", { driverUserId })
            .getRawOne<{ avg: string; cnt: string }>();
        const completedTrips = await this.rideRepo.count({
            where: { driverId: driverUserId, status: RideStatus.COMPLETED },
        });
        return {
            rating: agg ? Number(Number(agg.avg).toFixed(1)) : 0,
            ratingCount: agg ? Number(agg.cnt) : 0,
            completedTrips,
        };
    }

    /** Attach real driver stats to a customer-facing ride response (no-op if unassigned). */
    async withDriverStats(ride: Ride | null): Promise<any> {
        if (!ride || !ride.driverId) return ride;
        const driverStats = await this.getDriverPublicStats(ride.driverId);
        return { ...ride, driverStats };
    }

    /**
     * Get driver's current active ride
     */
    async getDriverActiveRide(driverId: string): Promise<Ride | null> {
        return this.rideRepo
            .createQueryBuilder("ride")
            .where("ride.driverId = :driverId", { driverId })
            .andWhere("ride.status NOT IN (:...finalStatuses)", {
                finalStatuses: [RideStatus.COMPLETED, RideStatus.CANCELLED],
            })
            .leftJoinAndSelect("ride.stops", "stops")
            .leftJoinAndSelect("ride.driver", "driver")
            .leftJoinAndSelect("driver.driverProfile", "driverProfile")
            .leftJoinAndSelect("ride.customer", "customer")
            // User has no name column; display names live on the profile relations.
            .leftJoinAndSelect("customer.buyerProfile", "customerBuyerProfile")
            .leftJoinAndSelect("customer.userProfile", "customerUserProfile")
            .getOne();
    }

    // ── Helpers ──

    private async getRideOrFail(rideId: string): Promise<Ride> {
        const ride = await this.rideRepo.findOne({ where: { id: rideId } });
        if (!ride) throw new Error("Ride not found");
        return ride;
    }

    /**
     * Notify shared contacts when ride starts
     */
    private async notifySharedContacts(rideId: string, ride: Ride): Promise<void> {
        const contacts = await this.contactRepo.find({ where: { rideId } });

        for (const contact of contacts) {
            if (contact.notified) continue;

            const message =
                `Hi ${contact.name}, your contact has started a VeloHub ride from ${ride.pickupAddress} to ${ride.dropoffAddress}. ` +
                `Track their ride in the VeloHub app.`;

            try {
                await this.preludeService.sendSMS(contact.phone, message);
                contact.notified = true;
                await this.contactRepo.save(contact);
            } catch (err) {
                log.error("Failed to notify shared contact", { rideId, error: (err as Error).message });
            }
        }
    }
}
