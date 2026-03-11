import { Response } from "express";
import { AuthRequest } from "../middleware/role-middleware";
import { SearchService, SearchParams } from "../services/search-service";
import { ProductCategory } from "../models/product";
import { createServiceLogger } from "../utils/logger";

const log = createServiceLogger("SearchController");

export class SearchController {
    private searchService = new SearchService();

    /**
     * GET /search — Unified search for merchants and products.
     */
    search = async (req: AuthRequest, res: Response) => {
        try {
            const {
                query,
                category,
                latitude,
                longitude,
                radiusKm,
                isOpen,
                page,
                limit,
                sortBy,
            } = req.query;

            const params: SearchParams = {
                query: query as string,
                category: category as ProductCategory,
                latitude: latitude ? Number(latitude) : undefined,
                longitude: longitude ? Number(longitude) : undefined,
                radiusKm: radiusKm ? Number(radiusKm) : undefined,
                isOpen: isOpen === "true" ? true : undefined,
                page: page ? Number(page) : undefined,
                limit: limit ? Number(limit) : undefined,
                sortBy: sortBy as SearchParams["sortBy"],
            };

            // Validate lat/lng pair
            if ((params.latitude && !params.longitude) || (!params.latitude && params.longitude)) {
                return res.status(400).json({ message: "Both latitude and longitude are required for geo search" });
            }

            const result = await this.searchService.search(params);
            return res.status(200).json(result);
        } catch (error) {
            log.error("Error searching", { error: (error as Error).message });
            return res.status(500).json({ message: "Internal server error" });
        }
    };
}
