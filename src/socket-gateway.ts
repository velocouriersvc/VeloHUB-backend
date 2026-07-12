import { Server as HttpServer } from "http";
import { Server, Socket } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import { redis } from "./utils/redis";
import { RedisLocationService } from "./services/redis-location-service";
import { RideMessageService } from "./services/ride-message-service";
import { NotificationService } from "./services/notification-service";
import { NotificationType } from "./models/notification";
import { createServiceLogger } from "./utils/logger";

const log = createServiceLogger("SocketGateway");

let io: Server | null = null;

export function getIO(): Server | null {
    return io;
}

// Shared chat plumbing (used by the socket handlers AND the REST endpoint).
const chatMessageService = new RideMessageService();
const chatNotificationService = new NotificationService();

/**
 * Persist a ride chat message, relay it to both parties' socket rooms, and push-notify
 * the recipient. The single source of truth for message delivery - REST and socket
 * sends both land here, so a message is never "sent" without being persisted.
 * senderRole "auto" resolves against the ride's customerId (REST path, uuid sender).
 */
export async function deliverRideMessage(
    rideId: string,
    senderId: string,
    senderRole: "customer" | "driver" | "auto",
    text: string
) {
    const msg = await chatMessageService.send(rideId, senderId, senderRole, text);
    if (io) {
        io.of("/rides").to(`ride:${rideId}`).emit("ride:message", msg);
        if (msg.driverUserId) {
            io.of("/drivers").to(`driver:${msg.driverUserId}`).emit("ride:message", msg);
        }
    }
    const recipient = msg.senderRole === "customer" ? msg.driverUserId : msg.customerId;
    if (recipient) {
        chatNotificationService
            .notify(recipient, NotificationType.MESSAGE_RECEIVED, "New message 💬", msg.text, {
                rideId,
                screen: msg.senderRole === "customer" ? "driver-rides" : "rides",
            })
            .catch((err) => log.warn("Chat push failed", { recipient, error: (err as Error).message }));
    }
    return msg;
}

/**
 * Initialise Socket.IO on top of the existing HTTP server.
 *
 * Namespaces:
 *   /drivers   – driver apps push their location here
 *   /rides     – customer apps subscribe to nearby drivers & ride status
 */
export function initSocketGateway(httpServer: HttpServer): Server {
    io = new Server(httpServer, {
        cors: { origin: "*", methods: ["GET", "POST"] },
        pingInterval: 25000,
        pingTimeout: 20000,
        transports: ["websocket", "polling"],
    });

    // CRITICAL for multi-replica deployments: without this adapter, rooms/emits only
    // reach sockets on the SAME pod - customer and driver on different pods would never
    // receive each other's chat messages or live locations.
    try {
        io.adapter(createAdapter(redis.duplicate(), redis.duplicate()));
        log.info("Socket.IO Redis adapter attached (cross-pod rooms enabled)");
    } catch (err) {
        log.error("Failed to attach Redis adapter - sockets are single-pod only", { error: (err as Error).message });
    }

    const locationService = new RedisLocationService();

    // ── /drivers namespace - used by driver apps ──
    const driversNs = io.of("/drivers");

    driversNs.on("connection", (socket: Socket) => {
        const driverId = socket.handshake.query.driverId as string;
        if (!driverId) {
            log.warn("Driver socket connected without driverId - disconnecting");
            socket.disconnect(true);
            return;
        }

        log.info("Driver connected", { driverId, socketId: socket.id });

        // Join a personal room so we can send targeted events
        socket.join(`driver:${driverId}`);

        // Driver sends location updates
        socket.on("location:update", async (data: { lat: number; lng: number; heading?: number; rideId?: string }) => {
            try {
                await locationService.updateDriverLocation(driverId, data.lat, data.lng);
                // Streaming drivers stay visible to matching (status TTL refresh, value kept).
                await locationService.touchDriverStatus(driverId);

                // Broadcast to the riders namespace so nearby customers see the car move
                io!.of("/rides").emit("driver:moved", {
                    driverId,
                    lat: data.lat,
                    lng: data.lng,
                    heading: data.heading ?? 0,
                    ts: Date.now(),
                });

                // If there's an active ride, also emit to that ride's room for the customer
                if (data.rideId) {
                    io!.of("/rides").to(`ride:${data.rideId}`).emit("driver:location", {
                        driverId,
                        lat: data.lat,
                        lng: data.lng,
                        heading: data.heading ?? 0,
                        ts: Date.now(),
                    });
                }
            } catch (err) {
                log.error("Error updating driver location", { driverId, error: (err as Error).message });
            }
        });

        // Driver goes online / offline
        socket.on("status:update", async (data: { status: "online" | "busy" | "offline" }) => {
            try {
                if (data.status === "offline") {
                    await locationService.removeDriver(driverId);
                } else {
                    await locationService.setDriverStatus(driverId, data.status);
                }
                log.info("Driver status changed", { driverId, status: data.status });
            } catch (err) {
                log.error("Error updating driver status", { driverId, error: (err as Error).message });
            }
        });

        // Driver sends a chat message to the customer of a ride
        socket.on("ride:message", async (data: { rideId: string; text: string }) => {
            try {
                await deliverRideMessage(data.rideId, driverId, "driver", data.text);
            } catch (err) {
                log.error("Driver ride message failed", { driverId, error: (err as Error).message });
                socket.emit("ride:message:error", { error: (err as Error).message });
            }
        });

        socket.on("disconnect", async () => {
            log.info("Driver disconnected", { driverId, socketId: socket.id });
            // Don't remove location immediately - let TTL handle it
        });
    });

    // ── /rides namespace - used by customer apps ──
    const ridesNs = io.of("/rides");

    ridesNs.on("connection", (socket: Socket) => {
        const userId = socket.handshake.query.userId as string;
        log.info("Rider connected", { userId: userId || "anonymous", socketId: socket.id });

        // Customer requests nearby drivers around a coordinate
        socket.on("drivers:nearby", async (data: { lat: number; lng: number; radiusKm?: number }) => {
            try {
                const nearby = await locationService.findNearbyDrivers(
                    data.lat,
                    data.lng,
                    data.radiusKm || 20, // match the ride-matching radius so the overlay agrees with booking
                );
                socket.emit("drivers:nearby:result", nearby);
            } catch (err) {
                log.error("Error finding nearby drivers", { error: (err as Error).message });
                socket.emit("drivers:nearby:result", []);
            }
        });

        // Customer subscribes to a specific ride's status updates
        socket.on("ride:subscribe", (data: { rideId: string }) => {
            socket.join(`ride:${data.rideId}`);
            log.info("Customer subscribed to ride", { userId, rideId: data.rideId });
        });

        socket.on("ride:unsubscribe", (data: { rideId: string }) => {
            socket.leave(`ride:${data.rideId}`);
        });

        // Customer subscribes to a specific order's status updates
        socket.on("order:subscribe", (data: { orderId: string }) => {
            socket.join(`order:${data.orderId}`);
            log.info("Customer subscribed to order", { userId, orderId: data.orderId });
        });

        socket.on("order:unsubscribe", (data: { orderId: string }) => {
            socket.leave(`order:${data.orderId}`);
        });

        // Customer sends a chat message to the driver of a ride
        socket.on("ride:message", async (data: { rideId: string; text: string }) => {
            try {
                // An unidentified socket (no userId in the handshake) cannot chat - fail
                // cleanly instead of hitting the senderId NOT NULL constraint.
                if (!userId) {
                    socket.emit("ride:message:error", { error: "Not identified - reconnect and try again" });
                    return;
                }
                await deliverRideMessage(data.rideId, userId, "customer", data.text);
            } catch (err) {
                log.error("Customer ride message failed", { userId, error: (err as Error).message });
                socket.emit("ride:message:error", { error: (err as Error).message });
            }
        });

        socket.on("disconnect", () => {
            log.info("Rider disconnected", { userId, socketId: socket.id });
        });
    });

    log.info("Socket.IO gateway initialised (/drivers, /rides namespaces)");
    return io;
}

// ── Helper to emit ride events from anywhere in the backend ──

export function emitRideEvent(rideId: string, event: string, payload: Record<string, any>) {
    if (!io) return;
    io.of("/rides").to(`ride:${rideId}`).emit(event, payload);
}

export function emitToUser(userId: string, event: string, payload: Record<string, any>) {
    if (!io) return;
    io.of("/rides").emit(event, { ...payload, targetUserId: userId });
}

/** Emit an event to a specific driver's personal room */
export function emitToDriver(driverId: string, event: string, payload: Record<string, any>) {
    if (!io) return;
    io.of("/drivers").to(`driver:${driverId}`).emit(event, payload);
}

// ── Helper to emit order status events from anywhere in the backend ──

export function emitOrderEvent(orderId: string, event: string, payload: Record<string, any>) {
    if (!io) return;
    io.of("/rides").to(`order:${orderId}`).emit(event, payload);
}

export function emitOrderStatusToUser(userId: string, orderId: string, status: string, extraPayload?: Record<string, any>) {
    if (!io) return;
    io.of("/rides").emit("order:status", {
        targetUserId: userId,
        orderId,
        status,
        ...extraPayload,
    });
}
