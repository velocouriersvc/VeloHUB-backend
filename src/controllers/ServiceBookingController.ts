import { Request, Response } from "express";
import { ServiceBookingService } from "../services/service-booking-service";
import { ServiceBookingStatus } from "../models/service-booking";
import { createServiceLogger } from "../utils/logger";

const log = createServiceLogger("ServiceBookingController");

export class ServiceBookingController {
    private bookingService = new ServiceBookingService();

    async createBooking(req: Request, res: Response) {
        try {
            const customerId = (req as any).user?.id;
            if (!customerId) return res.status(401).json({ message: "Unauthorized" });

            const result = await this.bookingService.createBooking({
                ...req.body,
                customerId,
            });

            return res.status(201).json(result);
        } catch (error) {
            log.error("Error creating service booking", { error: (error as Error).message });
            return res.status(400).json({ message: (error as Error).message });
        }
    }

    async updateStatus(req: Request, res: Response) {
        try {
            const userId = (req as any).user?.id;
            const { bookingId } = req.params;
            const { status, note } = req.body;

            if (!userId) return res.status(401).json({ message: "Unauthorized" });

            const booking = await this.bookingService.updateStatus(
                bookingId,
                userId,
                status as ServiceBookingStatus,
                note
            );

            return res.json(booking);
        } catch (error) {
            log.error("Error updating service booking status", { error: (error as Error).message });
            return res.status(400).json({ message: (error as Error).message });
        }
    }

    async getMyBookings(req: Request, res: Response) {
        try {
            const userId = (req as any).user?.id;
            if (!userId) return res.status(401).json({ message: "Unauthorized" });

            const bookings = await this.bookingService.getMyBookings(userId);
            return res.json(bookings);
        } catch (error) {
            return res.status(400).json({ message: (error as Error).message });
        }
    }

    async getMerchantBookings(req: Request, res: Response) {
        try {
            const userId = (req as any).user?.id;
            if (!userId) return res.status(401).json({ message: "Unauthorized" });

            const bookings = await this.bookingService.getMerchantBookings(userId);
            return res.json(bookings);
        } catch (error) {
            return res.status(400).json({ message: (error as Error).message });
        }
    }

    async getBookingById(req: Request, res: Response) {
        try {
            const userId = (req as any).user?.id;
            const { bookingId } = req.params;
            if (!userId) return res.status(401).json({ message: "Unauthorized" });

            const booking = await this.bookingService.getBookingById(bookingId, userId);
            if (!booking) return res.status(404).json({ message: "Booking not found" });

            return res.json(booking);
        } catch (error) {
            return res.status(400).json({ message: (error as Error).message });
        }
    }

    /**
     * POST /services/bookings/quote
     * Validates call type + travel radius and locks the travel fee for 15 min.
     */
    async quoteBooking(req: Request, res: Response) {
        try {
            const customerId = (req as any).user?.id;
            if (!customerId) return res.status(401).json({ message: "Unauthorized" });
            const { merchantId, productId, callType, latitude, longitude } = req.body;
            if (!merchantId || !productId || !callType) {
                return res.status(400).json({ message: "merchantId, productId and callType are required" });
            }
            const quote = await this.bookingService.quoteBooking({
                customerId, merchantId, productId, callType,
                latitude: latitude != null ? Number(latitude) : undefined,
                longitude: longitude != null ? Number(longitude) : undefined,
            });
            return res.json(quote);
        } catch (error) {
            return res.status(400).json({ message: (error as Error).message });
        }
    }

    /** GET /services/bookings/:bookingId/messages */
    async getMessages(req: Request, res: Response) {
        try {
            const userId = (req as any).user?.id;
            if (!userId) return res.status(401).json({ message: "Unauthorized" });
            const result = await this.bookingService.getMessages(req.params.bookingId, userId);
            return res.json(result);
        } catch (error) {
            const msg = (error as Error).message;
            if (/not found/i.test(msg)) return res.status(404).json({ message: msg });
            if (/Unauthorized/i.test(msg)) return res.status(403).json({ message: msg });
            return res.status(400).json({ message: msg });
        }
    }

    /** POST /services/bookings/:bookingId/messages */
    async sendMessage(req: Request, res: Response) {
        try {
            const userId = (req as any).user?.id;
            if (!userId) return res.status(401).json({ message: "Unauthorized" });
            const { text } = req.body;
            if (!text?.trim()) return res.status(400).json({ message: "text is required" });
            const message = await this.bookingService.sendMessage(req.params.bookingId, userId, text);
            return res.status(201).json({ message });
        } catch (error) {
            const msg = (error as Error).message;
            if (/not found/i.test(msg)) return res.status(404).json({ message: msg });
            if (/Unauthorized/i.test(msg)) return res.status(403).json({ message: msg });
            return res.status(400).json({ message: msg });
        }
    }

    /**
     * POST /services/bookings/:bookingId/complete
     */
    async completeBooking(req: Request, res: Response) {
        try {
            const userId = (req as any).user?.id;
            const { bookingId } = req.params;
            const { completionCode } = req.body;

            if (!userId) return res.status(401).json({ message: "Unauthorized" });
            if (!completionCode) return res.status(400).json({ message: "Completion code is required" });

            const booking = await this.bookingService.completeBooking(bookingId, userId, completionCode);

            return res.json({
                message: "Service booking completed and verified",
                booking
            });
        } catch (error) {
            log.error("Error completing service booking", { error: (error as Error).message });
            return res.status(400).json({ message: (error as Error).message });
        }
    }
}
