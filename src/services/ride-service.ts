import { AppDataSource } from "../db/data-source";
import { Ride, RideType, RideStatus, PaymentMethod, PaymentStatus, CancelledBy } from "../models/ride";
import { RideStop } from "../models/ride-stop";
import { RideSharedContact } from "../models/ride-shared-contact";
import { VehicleType } from "../models/vehicle-pricing";
import { PaymentMethodType } from "../models/payment";
import { FareService, FareBreakdown } from "./fare-service";
import { DriverMatchService, MatchedDriver } from "./driver-match-service";
import { PaymentService } from "./payment/payment-service";
import { NotificationService } from "./notification-service";
import { RedisLocationService } from "./redis-location-service";
import { TwilioService } from "./twilio-service";

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
    stops?: Array<{ address: string; lat: number; lng: number; stopOrder: number }>;
    sharedContacts?: Array<{ name: string; phone: string }>;
}

export interface RideEstimate {
    fareBreakdown: FareBreakdown;
    availableDrivers: number;
    estimatedPickupMin: number;
}

export class RideService {
    private rideRepo = AppDataSource.getRepository(Ride);
    private stopRepo = AppDataSource.getRepository(RideStop);
    private contactRepo = AppDataSource.getRepository(RideSharedContact);

    private fareService: FareService;
    private driverMatchService: DriverMatchService;
    private paymentService: PaymentService;
    private notificationService: NotificationService;
    private redisLocation: RedisLocationService;
    private twilioService: TwilioService;

    constructor() {
        this.fareService = new FareService();
        this.driverMatchService = new DriverMatchService();
        this.paymentService = new PaymentService();
        this.notificationService = new NotificationService();
        this.redisLocation = new RedisLocationService();
        this.twilioService = new TwilioService();
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
        promoCode?: string
    ): Promise<RideEstimate> {
        const fareBreakdown = await this.fareService.calculateFare(
            vehicleType,
            distanceKm,
            durationMin,
            promoCode
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
        promoCode?: string
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
                    promoCode
                );
                estimates.push(estimate);
            } catch {
                // Skip vehicle types without pricing
            }
        }

        return estimates;
    }

    // ── Ride Lifecycle ──

    /**
     * Step 1: Customer requests a ride
     */
    async requestRide(request: RideRequest): Promise<Ride> {
        // Calculate fare
        const fareBreakdown = await this.fareService.calculateFare(
            request.vehicleType,
            request.distanceKm,
            request.durationMin,
            request.promoCode
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
            distanceKm: request.distanceKm,
            durationMin: request.durationMin,
            baseFare: fareBreakdown.baseFare,
            subtotal: fareBreakdown.subtotal,
            surgeMultiplier: fareBreakdown.surgeMultiplier,
            surgeAmount: fareBreakdown.surgeAmount,
            discountPercent: fareBreakdown.discountPercent,
            discountAmount: fareBreakdown.discountAmount,
            finalFare: fareBreakdown.finalFare,
            passengerCount: request.passengerCount || 1,
            status: RideStatus.SEARCHING,
        });

        const savedRide = await this.rideRepo.save(ride);

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
                driverUserIds
            );
        }

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
        if (paymentMethod === PaymentMethod.MOMO || paymentMethod === PaymentMethod.WALLET) {
            const methodMap: Record<string, PaymentMethodType> = {
                [PaymentMethod.MOMO]: PaymentMethodType.MOMO,
                [PaymentMethod.WALLET]: PaymentMethodType.WALLET,
            };

            const result = await this.paymentService.processRidePayment({
                rideId,
                userId: ride.customerId,
                amount: Number(ride.finalFare),
                method: methodMap[paymentMethod],
                phoneNumber,
                email,
            });

            if (result.success && paymentMethod === PaymentMethod.WALLET) {
                // Wallet payment is instant — mark ride as paid
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

            return this.getRideOrFail(rideId);
        }

        // Cash — mark as paid (driver collects on delivery)
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

        if (ride.status !== RideStatus.PAID) {
            throw new Error("Payment must be confirmed before driver can depart");
        }

        ride.status = RideStatus.DRIVER_ENROUTE;
        const updated = await this.rideRepo.save(ride);

        await this.redisLocation.setRideTracking(rideId, { status: RideStatus.DRIVER_ENROUTE });
        await this.notificationService.notifyDriverEnroute(ride.customerId, driverName, rideId);

        return updated;
    }

    /**
     * Step 5: Driver arrived at pickup
     */
    async driverArrived(rideId: string, driverName: string): Promise<Ride> {
        const ride = await this.getRideOrFail(rideId);

        if (ride.status !== RideStatus.DRIVER_ENROUTE) {
            throw new Error("Driver must be en route first");
        }

        ride.status = RideStatus.ARRIVED;
        const updated = await this.rideRepo.save(ride);

        await this.redisLocation.setRideTracking(rideId, { status: RideStatus.ARRIVED });
        await this.notificationService.notifyDriverArrived(ride.customerId, driverName, rideId);

        return updated;
    }

    /**
     * Step 6: Start the ride
     */
    async startRide(rideId: string): Promise<Ride> {
        const ride = await this.getRideOrFail(rideId);

        if (ride.status !== RideStatus.ARRIVED) {
            throw new Error("Driver must have arrived at pickup");
        }

        ride.status = RideStatus.ONGOING;
        ride.startedAt = new Date();
        const updated = await this.rideRepo.save(ride);

        await this.redisLocation.setRideTracking(rideId, { status: RideStatus.ONGOING });
        await this.notificationService.notifyRideStarted(ride.customerId, rideId);

        // Notify shared contacts that ride has started
        await this.notifySharedContacts(rideId, ride);

        return updated;
    }

    /**
     * Step 7: Complete the ride
     */
    async completeRide(rideId: string): Promise<Ride> {
        const ride = await this.getRideOrFail(rideId);

        if (ride.status !== RideStatus.ONGOING) {
            throw new Error("Ride must be ongoing to complete");
        }

        ride.status = RideStatus.COMPLETED;
        ride.completedAt = new Date();
        const updated = await this.rideRepo.save(ride);

        // Credit driver earnings (for momo/wallet payments)
        if (
            ride.driverId &&
            ride.paymentMethod !== PaymentMethod.CASH
        ) {
            await this.paymentService.creditDriverEarnings(
                ride.driverId,
                rideId,
                Number(ride.finalFare)
            );

            const driverAmount = Math.round(Number(ride.finalFare) * 0.8 * 100) / 100;
            await this.notificationService.notifyDriverEarnings(
                ride.driverId,
                driverAmount,
                rideId
            );
        }

        // For cash payments, confirm cash payment and credit driver later
        if (ride.paymentMethod === PaymentMethod.CASH && ride.driverId) {
            await this.paymentService.confirmCashPayment(rideId);
            await this.paymentService.creditDriverEarnings(
                ride.driverId,
                rideId,
                Number(ride.finalFare)
            );

            const driverAmount = Math.round(Number(ride.finalFare) * 0.8 * 100) / 100;
            await this.notificationService.notifyDriverEarnings(
                ride.driverId,
                driverAmount,
                rideId
            );
        }

        // Notify customer
        await this.notificationService.notifyRideCompleted(
            ride.customerId,
            Number(ride.finalFare),
            rideId
        );

        // Use promo code if one was applied
        if (ride.promoCodeId && ride.discountPercent > 0) {
            // We need to find the promo code — this is stored on the ride
            // The fare service will handle incrementing usage
        }

        // Clean up Redis
        await this.redisLocation.removeRideTracking(rideId);
        if (ride.driverId) {
            await this.redisLocation.setDriverStatus(ride.driverId, "online");
        }

        return updated;
    }

    /**
     * Cancel a ride
     */
    async cancelRide(
        rideId: string,
        cancelledBy: CancelledBy,
        reason?: string
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

        // Notify the other party
        const cancelledByLabel = cancelledBy === CancelledBy.CUSTOMER ? "Customer" : "Driver";
        const cancelMessage = reason || `Ride cancelled by ${cancelledByLabel}`;

        if (cancelledBy === CancelledBy.CUSTOMER && ride.driverId) {
            await this.notificationService.notifyRideCancelled(ride.driverId, cancelMessage, rideId);
        } else if (cancelledBy === CancelledBy.DRIVER) {
            await this.notificationService.notifyRideCancelled(ride.customerId, cancelMessage, rideId);
        }

        // TODO: Handle refund logic if payment was already made (momo/wallet)
        // For now, refunds would be a manual process

        // Clean up Redis
        await this.redisLocation.removeRideTracking(rideId);
        await this.redisLocation.removeBroadcast(rideId);
        if (ride.driverId) {
            await this.redisLocation.setDriverStatus(ride.driverId, "online");
        }

        return updated;
    }

    // ── Queries ──

    /**
     * Get ride by ID with relations
     */
    async getRideById(rideId: string): Promise<Ride | null> {
        return this.rideRepo.findOne({
            where: { id: rideId },
            relations: ["stops", "sharedContacts"],
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
            .getOne();
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
                await this.twilioService.sendSMS(contact.phone, message);
                contact.notified = true;
                await this.contactRepo.save(contact);
            } catch (err: any) {
                console.error(`Failed to notify contact ${contact.phone}:`, err.message);
            }
        }
    }
}
