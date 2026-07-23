import { Response } from "express";
import { AuthRequest } from "../middleware/role-middleware";
import { ScheduledRideService } from "../services/scheduled-ride-service";
import { VehicleType } from "../models/vehicle-pricing";
import { createServiceLogger } from "../utils/logger";

const log = createServiceLogger("ScheduledRideController");

const VEHICLE_MAP: Record<string, VehicleType> = {
    motorbike: VehicleType.BIKE,
    bike: VehicleType.BIKE,
    car: VehicleType.CAR,
    priority: VehicleType.PRIORITY,
    suv: VehicleType.SUV,
    van: VehicleType.TRUCK,
    truck: VehicleType.TRUCK,
};

function mapVehicleType(input: string): VehicleType {
    return VEHICLE_MAP[String(input || "").toLowerCase()] || VehicleType.CAR;
}

export class ScheduledRideController {
    private service = new ScheduledRideService();

    /** POST /rides/schedule */
    create = async (req: AuthRequest, res: Response) => {
        try {
            const userId = req.user?.id;
            if (!userId) return res.status(401).json({ message: "User ID required" });

            const {
                pickupAddress, pickupLat, pickupLng,
                dropoffAddress, dropoffLat, dropoffLng,
                vehicleType, distanceKm, durationMin,
                scheduledAt, paymentMethod, country, email, phoneNumber, notes,
            } = req.body;

            if (!pickupAddress || !pickupLat || !dropoffAddress || !dropoffLat
                || !vehicleType || !distanceKm || !durationMin || !scheduledAt) {
                return res.status(400).json({ message: "Missing required scheduled ride fields" });
            }
            if (new Date(scheduledAt).getTime() <= Date.now()) {
                return res.status(400).json({ message: "Scheduled time must be in the future" });
            }

            const result = await this.service.create({
                customerId: userId,
                pickupAddress,
                pickupLat: Number(pickupLat),
                pickupLng: Number(pickupLng),
                dropoffAddress,
                dropoffLat: Number(dropoffLat),
                dropoffLng: Number(dropoffLng),
                vehicleType: mapVehicleType(vehicleType),
                distanceKm: Number(distanceKm),
                durationMin: Number(durationMin),
                scheduledAt,
                // No cash default: scheduled rides are prepaid, and the service rejects
                // a missing or cash method.
                paymentMethod,
                country,
                email,
                phoneNumber,
                notes,
            });

            return res.status(201).json({
                scheduledRide: result.scheduledRide,
                authorizationUrl: result.payment?.authorizationUrl,
                paymentStatus: result.scheduledRide.paymentStatus,
                paymentReference: result.payment?.reference,
            });
        } catch (error) {
            const msg = (error as Error).message || "Internal server error";
            // Business rejections (prepaid-only, future-time, payment init) are client
            // errors, not server faults: return 400 and log at warn.
            const isClientError = /prepaid|must be|required|future|invalid|payment/i.test(msg);
            if (isClientError) {
                log.warn("Scheduled ride rejected", { message: msg });
                return res.status(400).json({ message: msg });
            }
            log.error("Error creating scheduled ride", { error: msg });
            return res.status(500).json({ message: msg });
        }
    };

    /** GET /rides/scheduled */
    list = async (req: AuthRequest, res: Response) => {
        try {
            const userId = req.user?.id;
            if (!userId) return res.status(401).json({ message: "User ID required" });
            const rides = await this.service.listForCustomer(userId);
            return res.status(200).json({ scheduledRides: rides });
        } catch (error) {
            log.error("Error listing scheduled rides", { error: (error as Error).message });
            return res.status(500).json({ message: (error as Error).message || "Internal server error" });
        }
    };

    /** POST /rides/scheduled/:id/cancel */
    cancel = async (req: AuthRequest, res: Response) => {
        try {
            const userId = req.user?.id;
            if (!userId) return res.status(401).json({ message: "User ID required" });
            const result = await this.service.cancel(req.params.id, userId);
            return res.status(200).json({ cancelled: true, refunded: result.refunded, feeKept: result.feeKept, late: result.late });
        } catch (error) {
            const msg = (error as Error).message || "Internal server error";
            const code = /not found/i.test(msg) ? 404 : /already dispatched/i.test(msg) ? 400 : 500;
            log.error("Error cancelling scheduled ride", { error: msg });
            return res.status(code).json({ message: msg });
        }
    };
}
