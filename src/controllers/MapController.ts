import { Request, Response } from "express";
import { RedisLocationService } from "../services/redis-location-service";
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
}
