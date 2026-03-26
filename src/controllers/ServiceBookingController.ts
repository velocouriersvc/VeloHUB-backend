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
}
