import { Router, Request, Response } from "express";
import { minioClient, BUCKET_NAME } from "../utils/minio-client";
import { createServiceLogger } from "../utils/logger";

const log = createServiceLogger("PublicAssets");
const router = Router();

/**
 * Public, read-only streaming of uploaded assets (product/profile images, etc.).
 *
 * MinIO is internal-only (minio-service:9000) and nginx only proxies the API, so
 * the public image URLs (https://<api>/<bucket>/<key>) land on the API. We stream
 * the object from MinIO using the server's credentials, which makes images load on
 * iOS and Android without exposing MinIO or depending on a public bucket policy.
 */
router.get("/:key(*)", async (req: Request, res: Response) => {
    // Everything after the mounted bucket prefix is the object key (may contain "/").
    const key = decodeURIComponent(req.params.key || "").replace(/^\/+/, "");
    if (!key) return res.status(400).end();

    try {
        const stat = await minioClient.statObject(BUCKET_NAME, key);
        res.setHeader("Content-Type", stat.metaData?.["content-type"] || "application/octet-stream");
        res.setHeader("Content-Length", String(stat.size));
        res.setHeader("Cache-Control", "public, max-age=86400");

        const stream = await minioClient.getObject(BUCKET_NAME, key);
        stream.on("error", (err) => {
            log.warn("Asset stream error", { key, error: (err as Error).message });
            if (!res.headersSent) res.status(404).end();
        });
        stream.pipe(res);
    } catch (err) {
        log.warn("Asset not found", { key, error: (err as Error).message });
        res.status(404).end();
    }
});

export default router;
