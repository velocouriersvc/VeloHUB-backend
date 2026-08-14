import { Request, Response } from "express";
import { RedisLocationService } from "../services/redis-location-service";
import { AppDataSource } from "../db/data-source";
import { User } from "../models/user";
import { createServiceLogger } from "../utils/logger";

const log = createServiceLogger("MapController");

export class MapController {
    private redisLocation = new RedisLocationService();

    /**
     * GET /map/live
     * Public (api-key only): anonymized, coarsened locations of active drivers for the
     * customer web coverage map. No driver identity is exposed.
     */
    getLive = async (_req: Request, res: Response) => {
        try {
            const drivers = await this.redisLocation.getOnlineDriverPoints();
            return res.json({ drivers });
        } catch (error) {
            log.error("Error getting live map data", { error: (error as Error).message });
            return res.status(500).json({ message: "Internal server error" });
        }
    };

    /**
     * GET /map/users
     * Public (api-key only): signed-up user counts grouped by country for the coverage map.
     * Aggregate only - users store just a country, so no identities or precise locations are exposed.
     */
    getUsers = async (_req: Request, res: Response) => {
        try {
            const rows = await AppDataSource.getRepository(User)
                .createQueryBuilder("u")
                .select("u.country", "country")
                .addSelect("COUNT(*)", "count")
                .where("u.country IS NOT NULL AND u.country <> ''")
                .groupBy("u.country")
                .getRawMany();
            const users = rows.map((r) => ({ country: String(r.country), count: Number(r.count) }));
            return res.json({ users });
        } catch (error) {
            log.error("Error getting user map data", { error: (error as Error).message });
            return res.status(500).json({ message: "Internal server error" });
        }
    };
}
