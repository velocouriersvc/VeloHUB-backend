import { Request, Response } from "express";
import { AppDataSource } from "../db/data-source";
import { Ride, RideStatus, RideType, PaymentMethod, PaymentStatus } from "../models/ride";
import { User, UserStatus } from "../models/user";
import { DriverProfile } from "../models/driver-profile";
import { VehicleType } from "../models/vehicle-pricing";
import { RideService } from "../services/ride-service";
import { createServiceLogger } from "../utils/logger";
import { currencyForCountry } from "../utils/currency";
import crypto from "crypto";

const log = createServiceLogger("SimulateController");

export class SimulateController {
    private rideRepo = AppDataSource.getRepository(Ride);
    private userRepo = AppDataSource.getRepository(User);
    private driverRepo = AppDataSource.getRepository(DriverProfile);
    private rideService = new RideService();

    /**
     * POST /admin/simulate/ride
     * Creates a ride in REQUESTED status with provided customer and driver
     */
    createSimulationRide = async (req: Request, res: Response) => {
        try {
            const { customerId, driverId, vehicleType, fare } = req.body;

            if (!customerId || !driverId) {
                return res.status(400).json({ message: "customerId and driverId are required" });
            }

            // Verify users
            const customer = await this.userRepo.findOneBy({ id: customerId });
            const driver = await this.userRepo.findOneBy({ id: driverId });

            if (!customer || !driver) {
                return res.status(404).json({ message: "Customer or Driver not found" });
            }

            const ride = this.rideRepo.create({
                id: crypto.randomUUID(),
                customerId,
                driverId, // Pre-assign for simulation ease
                type: RideType.RIDE,
                status: RideStatus.SEARCHING,
                pickupAddress: "Simulation Start",
                dropoffAddress: "Simulation End",
                pickupLat: 5.6037,
                pickupLng: -0.1870,
                dropoffLat: 5.6147,
                dropoffLng: -0.1770,
                vehicleType: vehicleType || VehicleType.CAR,
                currency: currencyForCountry(customer.country),
                distanceKm: 5,
                durationMin: 15,
                baseFare: fare || 100,
                subtotal: fare || 100,
                finalFare: fare || 100,
                paymentMethod: PaymentMethod.CASH,
                paymentStatus: PaymentStatus.PENDING,
            });

            await this.rideRepo.save(ride);
            log.info("Simulation ride created", { rideId: ride.id });

            return res.status(201).json(ride);
        } catch (error) {
            log.error("Error creating simulation ride", { error: (error as Error).message });
            return res.status(500).json({ message: "Internal server error" });
        }
    };

    /**
     * PATCH /admin/simulate/ride/:id/advance
     * Advances ride to the next status in the flow
     */
    advanceRideStatus = async (req: Request, res: Response) => {
        try {
            const { id } = req.params;
            const ride = await this.rideRepo.findOne({
                where: { id },
                relations: ["customer", "driver"]
            });

            if (!ride) return res.status(404).json({ message: "Ride not found" });

            const statusFlow = [
                RideStatus.SEARCHING,
                RideStatus.ACCEPTED,
                RideStatus.PAID,
                RideStatus.DRIVER_ENROUTE,
                RideStatus.ARRIVED,
                RideStatus.ONGOING,
                RideStatus.COMPLETED
            ];

            const currentIndex = statusFlow.indexOf(ride.status as RideStatus);
            if (currentIndex === -1 || currentIndex === statusFlow.length - 1) {
                return res.status(400).json({ message: `Cannot advance from status: ${ride.status}` });
            }

            const nextStatus = statusFlow[currentIndex + 1];

            if (!ride.driverId && nextStatus !== RideStatus.SEARCHING) {
                 return res.status(400).json({ message: "Driver must be assigned to advance" });
            }

            // Use RideService for complex transitions
            if (nextStatus === RideStatus.ACCEPTED) {
                await this.rideService.acceptRide(ride.id, ride.driverId!, "Simulation Driver");
            } else if (nextStatus === RideStatus.PAID) {
                await this.rideService.setPaymentMethod(ride.id, PaymentMethod.CASH);
            } else if (nextStatus === RideStatus.DRIVER_ENROUTE) {
                await this.rideService.driverEnroute(ride.id, "Simulation Driver");
            } else if (nextStatus === RideStatus.ARRIVED) {
                await this.rideService.driverArrived(ride.id, "Simulation Driver");
            } else if (nextStatus === RideStatus.ONGOING) {
                await this.rideService.startRide(ride.id);
            } else if (nextStatus === RideStatus.COMPLETED) {
                await this.rideService.completeRide(ride.id);
            } else {
                ride.status = nextStatus;
                await this.rideRepo.save(ride);
            }

            const updatedRide = await this.rideRepo.findOneBy({ id });
            return res.json(updatedRide);
        } catch (error) {
            log.error("Error advancing ride status", { error: (error as Error).message });
            return res.status(500).json({ message: (error as Error).message || "Internal server error" });
        }
    };
}
