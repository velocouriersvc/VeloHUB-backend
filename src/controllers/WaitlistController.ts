import { Request, Response } from "express";
import { AppDataSource } from "../db/data-source";
import { Waitlist } from "../models/waitlist";
import { WaitlistCountry } from "../models/waitlist-country";
import { AuditLogController } from "./AuditLogController";
import { AuditRiskLevel } from "../models/audit-log";

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
            const entry = await this.waitlistRepo.findOne({ where: { id }, relations: ["country"] });
            const result = await this.waitlistRepo.delete(id);

            if (result.affected === 0) {
                return res.status(404).json({ message: "Entry not found" });
            }

            if (entry) {
                await AuditLogController.record({
                    action: "Delete Waitlist Entry",
                    entity_type: "waitlist",
                    entity_id: id,
                    performed_by: (req as any).user?.email || (req as any).user?.phoneNumber || "Admin",
                    details: `Deleted entry for ${entry.fullName} (${entry.phoneNumber}) in ${entry.country?.name || 'Unknown'}`,
                    risk_level: AuditRiskLevel.MEDIUM
                });
            }

            return res.status(204).send();
        } catch (error) {
            console.error("Error deleting waitlist entry:", error);
            return res.status(500).json({ message: "Internal server error", error: (error as Error).message });
        }
    };

    /**
     * GET /api/v1/waitlist/countries
     */
    getCountries = async (req: Request, res: Response) => {
        try {
            const { all } = req.query;
            const where = all === "true" ? {} : { isActive: true };
            const countries = await this.countryRepo.find({
                where,
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

            const existing = await this.countryRepo.findOneBy({ code });
            if (existing) {
                return res.status(400).json({ message: `Country with code ${code} already exists` });
            }

            const country = this.countryRepo.create({ name, code });
            await this.countryRepo.save(country);

            await AuditLogController.record({
                action: "Add Waitlist Country",
                entity_type: "waitlist_country",
                entity_id: country.id,
                performed_by: (req as any).user?.email || (req as any).user?.phoneNumber || "Admin",
                details: `Added country: ${name} (${code})`,
                risk_level: AuditRiskLevel.LOW
            });

            return res.status(201).json(country);
        } catch (error) {
            console.error("Error adding waitlist country:", error);
            const message = (error as Error).message;
            if (message.includes("unique constraint")) {
                return res.status(400).json({ message: "Country code already exists" });
            }
            return res.status(500).json({ message: "Internal server error", error: message });
        }
    };

    /**
     * PATCH /api/v1/waitlist/countries/:id
     */
    updateCountry = async (req: Request, res: Response) => {
        try {
            const { id } = req.params;
            const { name, code, isActive } = req.body;

            const country = await this.countryRepo.findOneBy({ id });
            if (!country) {
                return res.status(404).json({ message: "Country not found" });
            }

            if (name !== undefined) country.name = name;
            if (code !== undefined) country.code = code;
            if (isActive !== undefined) country.isActive = isActive;

            await this.countryRepo.save(country);

            await AuditLogController.record({
                action: "Update Waitlist Country",
                entity_type: "waitlist_country",
                entity_id: id,
                performed_by: (req as any).user?.email || (req as any).user?.phoneNumber || "Admin",
                details: `Updated country: ${country.name} (${country.code}), Active: ${country.isActive}`,
                risk_level: AuditRiskLevel.LOW
            });

            return res.json(country);
        } catch (error) {
            console.error("Error updating waitlist country:", error);
            return res.status(500).json({ message: "Internal server error", error: (error as Error).message });
        }
    };

    /**
     * DELETE /api/v1/waitlist/countries/:id
     */
    deleteCountry = async (req: Request, res: Response) => {
        try {
            const { id } = req.params;
            const country = await this.countryRepo.findOneBy({ id });
            
            if (!country) {
                return res.status(404).json({ message: "Country not found" });
            }

            await this.countryRepo.delete(id);

            await AuditLogController.record({
                action: "Delete Waitlist Country",
                entity_type: "waitlist_country",
                entity_id: id,
                performed_by: (req as any).user?.email || (req as any).user?.phoneNumber || "Admin",
                details: `Deleted country: ${country.name} (${country.code})`,
                risk_level: AuditRiskLevel.MEDIUM
            });

            return res.status(204).send();
        } catch (error) {
            console.error("Error deleting waitlist country:", error);
            return res.status(500).json({ message: "Internal server error", error: (error as Error).message });
        }
    };
}
