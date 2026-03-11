import { Router } from "express";
import { SearchController } from "../controllers/SearchController";
import { apiKeyMiddleware } from "../middleware/api-key-middleware";
import { requireRole } from "../middleware/role-middleware";

const router = Router();
const searchController = new SearchController();

// Apply API Key Middleware
router.use(apiKeyMiddleware);

const anyRole = requireRole(["buyer", "driver", "merchant", "admin"]);

/**
 * @openapi
 * /search:
 *   get:
 *     tags: [Search]
 *     summary: Search merchants and products
 *     description: |
 *       Unified search that returns matching merchants and products.
 *       Supports text search, category filtering, geo filtering (Haversine), and sorting.
 *       Results are cached in Redis for 5 minutes.
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/PhoneNumber'
 *       - name: query
 *         in: query
 *         description: Text search query (searches name, description, tags, address)
 *         schema:
 *           type: string
 *         example: "jollof"
 *       - name: category
 *         in: query
 *         description: Filter by product/merchant category
 *         schema:
 *           type: string
 *           enum: [food, grocery, pharmacy, marketplace, rentals, services]
 *       - name: latitude
 *         in: query
 *         description: User's latitude for geo search. Must be paired with longitude.
 *         schema:
 *           type: number
 *           format: double
 *         example: 5.6037
 *       - name: longitude
 *         in: query
 *         description: User's longitude for geo search. Must be paired with latitude.
 *         schema:
 *           type: number
 *           format: double
 *         example: -0.1870
 *       - name: radiusKm
 *         in: query
 *         description: Search radius in kilometers (default 10)
 *         schema:
 *           type: number
 *           default: 10
 *       - name: isOpen
 *         in: query
 *         description: Filter to only show currently open merchants
 *         schema:
 *           type: boolean
 *       - name: sortBy
 *         in: query
 *         description: Sort order
 *         schema:
 *           type: string
 *           enum: [relevance, distance, rating, price_asc, price_desc]
 *           default: relevance
 *       - name: page
 *         in: query
 *         schema:
 *           type: integer
 *           default: 1
 *       - name: limit
 *         in: query
 *         schema:
 *           type: integer
 *           default: 20
 *           maximum: 50
 *     responses:
 *       200:
 *         description: Search results with merchants and products arrays
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 merchants:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       businessName:
 *                         type: string
 *                       category:
 *                         type: string
 *                       isOpen:
 *                         type: boolean
 *                       distance:
 *                         type: number
 *                         description: Distance in km (only when lat/lng provided)
 *                       rating:
 *                         type: number
 *                       ratingCount:
 *                         type: integer
 *                 products:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       name:
 *                         type: string
 *                       price:
 *                         type: number
 *                       merchantName:
 *                         type: string
 *                       distance:
 *                         type: number
 *                 total:
 *                   type: object
 *                   properties:
 *                     merchants:
 *                       type: integer
 *                     products:
 *                       type: integer
 *                 page:
 *                   type: integer
 *                 limit:
 *                   type: integer
 *       400:
 *         description: Missing latitude or longitude (must provide both)
 *       403:
 *         description: Invalid API key or role not approved
 */
router.get("/", anyRole, searchController.search);

export default router;
