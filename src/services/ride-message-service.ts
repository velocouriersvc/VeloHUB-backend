import { AppDataSource } from "../db/data-source";
import { RideMessage, RideMessageSender } from "../models/ride-message";
import { Ride } from "../models/ride";
import { createServiceLogger } from "../utils/logger";

const log = createServiceLogger("RideMessageService");

export interface RideMessageDTO {
    id: string;
    rideId: string;
    senderId: string;
    senderRole: RideMessageSender;
    text: string;
    createdAt: string;
    // Routing helpers (who the counterparties are), so the gateway can relay.
    customerId: string;
    driverUserId: string | null;
}

export class RideMessageService {
    private repo = AppDataSource.getRepository(RideMessage);
    private rideRepo = AppDataSource.getRepository(Ride);

    /** Persist a message and return it plus the ride's parties for relaying.
     *  senderRole "auto" resolves by comparing senderId to the ride's customerId
     *  (used by the REST path, where senderId is the authenticated User id). */
    async send(rideId: string, senderId: string, senderRole: RideMessageSender | "auto", text: string): Promise<RideMessageDTO> {
        const trimmed = (text || "").trim();
        if (!trimmed) throw new Error("Message text is required");
        if (trimmed.length > 2000) throw new Error("Message too long");

        const ride = await this.rideRepo.findOne({ where: { id: rideId } });
        if (!ride) throw new Error("Ride not found");

        const role: RideMessageSender = senderRole === "auto"
            ? (senderId === ride.customerId ? "customer" : "driver")
            : senderRole;

        const saved = await this.repo.save(this.repo.create({ rideId, senderId, senderRole: role, text: trimmed }));
        log.info("Ride message stored", { rideId, senderRole: role });

        return {
            id: saved.id,
            rideId,
            senderId,
            senderRole: role,
            text: saved.text,
            createdAt: saved.createdAt.toISOString(),
            customerId: ride.customerId,
            driverUserId: ride.driverId,
        };
    }

    /** Chat history for a ride, oldest first. */
    async list(rideId: string): Promise<RideMessageDTO[]> {
        const ride = await this.rideRepo.findOne({ where: { id: rideId } });
        if (!ride) return [];
        const rows = await this.repo.find({ where: { rideId }, order: { createdAt: "ASC" } });
        return rows.map((m) => ({
            id: m.id,
            rideId,
            senderId: m.senderId,
            senderRole: m.senderRole,
            text: m.text,
            createdAt: m.createdAt.toISOString(),
            customerId: ride.customerId,
            driverUserId: ride.driverId,
        }));
    }
}
