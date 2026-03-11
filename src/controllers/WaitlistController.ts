import { Request, Response } from "express";
import { AppDataSource } from "../db/data-source";
import { Waitlist } from "../models/waitlist";
import { WaitlistCountry } from "../models/waitlist-country";

export class WaitlistController {
    private waitlistRepo = AppDataSource.getRepository(Waitlist);
    private countryRepo = AppDataSource.getRepository(WaitlistCountry);

    /**
     * GET /api/v1/waitlist/entries
     */
    getEntries = async (req: Request, res: Response) => {
        try {
            const entries = await this.waitlistRepo.find({
                relations: ["country"],
                order: { createdAt: "DESC" }
            });
            return res.json(entries);
        } catch (error) {
            console.error("Error fetching waitlist entries:", error);
            return res.status(500).json({ message: "Internal server error" });
        }
    };

    /**
     * POST /api/v1/waitlist/join
     */
    joinWaitlist = async (req: Request, res: Response) => {
        try {
            const { fullName, email, phoneNumber, countryId } = req.body;

            if (!fullName || !email || !phoneNumber || !countryId) {
                return res.status(400).json({ message: "All fields are required" });
            }

            const entry = this.waitlistRepo.create({
                fullName,
                email,
                phoneNumber,
                countryId
            });

            await this.waitlistRepo.save(entry);
            return res.status(201).json(entry);
        } catch (error) {
            console.error("Error joining waitlist:", error);
            return res.status(500).json({ message: "Internal server error" });
        }
    };

    /**
     * DELETE /api/v1/waitlist/entries/:id
     */
    deleteEntry = async (req: Request, res: Response) => {
        try {
            const { id } = req.params;
            const result = await this.waitlistRepo.delete(id);

            if (result.affected === 0) {
                return res.status(404).json({ message: "Entry not found" });
            }

            return res.status(204).send();
        } catch (error) {
            console.error("Error deleting waitlist entry:", error);
            return res.status(500).json({ message: "Internal server error" });
        }
    };

    /**
     * GET /api/v1/waitlist/countries
     */
    getCountries = async (req: Request, res: Response) => {
        try {
            const countries = await this.countryRepo.find({
                where: { isActive: true },
                order: { name: "ASC" }
            });
            return res.json(countries);
        } catch (error) {
            console.error("Error fetching waitlist countries:", error);
            return res.status(500).json({ message: "Internal server error" });
        }
    };

    /**
     * POST /api/v1/waitlist/countries
     */
    addCountry = async (req: Request, res: Response) => {
        try {
            const { name, code } = req.body;

            if (!name || !code) {
                return res.status(400).json({ message: "Name and code are required" });
            }

            const country = this.countryRepo.create({ name, code });
            await this.countryRepo.save(country);

            return res.status(201).json(country);
        } catch (error) {
            console.error("Error adding waitlist country:", error);
            return res.status(500).json({ message: "Internal server error" });
        }
    };
}
