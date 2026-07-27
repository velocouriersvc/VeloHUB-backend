import { AppDataSource } from "../db/data-source";
import { RideMessage, RideMessageSender } from "../models/ride-message";
import { Ride } from "../models/ride";
import { Order } from "../models/order";
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
    private orderRepo = AppDataSource.getRepository(Order);

    /** Resolve the chat context (customer + driver) for a job id that is EITHER a
     *  ride (passenger/package) OR a marketplace order (delivery). The driver app
     *  passes an order id for order deliveries, so the chat must work for both. */
    private async resolveContext(jobId: string): Promise<{ customerId: string; driverUserId: string | null } | null> {
        const ride = await this.rideRepo.findOne({ where: { id: jobId } });
        if (ride) return { customerId: ride.customerId, driverUserId: ride.driverId };
        const order = await this.orderRepo.findOne({ where: { id: jobId } });
        if (order) return { customerId: order.customerId, driverUserId: order.driverId };
        return null;
    }

    /** Persist a message and return it plus the job's parties for relaying.
     *  senderRole "auto" resolves by comparing senderId to the customerId
     *  (used by the REST path, where senderId is the authenticated User id). */
    async send(rideId: string, senderId: string, senderRole: RideMessageSender | "auto", text: string): Promise<RideMessageDTO> {
        const trimmed = (text || "").trim();
        if (!trimmed) throw new Error("Message text is required");
        if (trimmed.length > 2000) throw new Error("Message too long");

        const ctx = await this.resolveContext(rideId);
        if (!ctx) throw new Error("Conversation not found");

        const role: RideMessageSender = senderRole === "auto"
            ? (senderId === ctx.customerId ? "customer" : "driver")
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
            customerId: ctx.customerId,
            driverUserId: ctx.driverUserId,
        };
    }

    /** Chat history for a ride or order, oldest first. */
    async list(rideId: string): Promise<RideMessageDTO[]> {
        const ctx = await this.resolveContext(rideId);
        if (!ctx) return [];
        const rows = await this.repo.find({ where: { rideId }, order: { createdAt: "ASC" } });
        return rows.map((m) => ({
            id: m.id,
            rideId,
            senderId: m.senderId,
            senderRole: m.senderRole,
            text: m.text,
            createdAt: m.createdAt.toISOString(),
            customerId: ctx.customerId,
            driverUserId: ctx.driverUserId,
        }));
    }
}
