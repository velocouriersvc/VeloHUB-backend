import "dotenv/config";
import crypto from "crypto";
import { AppDataSource } from "../db/data-source";
import { Product } from "../models/product";
import { minioClient, BUCKET_NAME } from "../utils/minio-client";
import { getPublicObjectUrl } from "../services/upload-service";
import logger from "../utils/logger";

/**
 * Backfill product images into the MinIO bucket so they display in the apps and
 * to confirm the upload -> bucket -> public-URL -> /<bucket>/<key> serving works.
 *
 * For every product without a usable (http/https) image, uploads a sample image
 * to the bucket and saves the public URL on the product. Products that already
 * have a real image are left untouched (use force to replace all). This is
 * self-limiting: once a product has an http image it is skipped on later runs.
 *
 * Runs automatically on server boot (see run-seeds.ts), and can be run manually:
 *   npx ts-node src/scripts/backfill-product-images.ts
 *   FORCE=1 npx ts-node src/scripts/backfill-product-images.ts
 */
async function fetchSampleImage(seed: string): Promise<Buffer> {
    // Deterministic per-product placeholder photo (so re-runs are stable).
    const url = `https://picsum.photos/seed/${encodeURIComponent(seed)}/600/600`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`image fetch failed (${res.status})`);
    return Buffer.from(await res.arrayBuffer());
}

export async function backfillProductImages(
    alreadyInitialised = false,
    opts: { force?: boolean } = {}
): Promise<void> {
    if (!alreadyInitialised) {
        await AppDataSource.initialize();
    }
    try {
        const force = opts.force ?? process.env.FORCE === "1";
        const repo = AppDataSource.getRepository(Product);
        const products = await repo.find();

        // Only the products that actually need an image (keeps boot cost ~zero once done).
        const targets = products.filter(
            (p) => force || !(Array.isArray(p.images) && p.images.some((u) => /^https?:\/\//.test(u)))
        );
        if (targets.length === 0) {
            logger.info("Product image backfill: nothing to do");
            return;
        }

        let updated = 0;
        for (const p of targets) {
            try {
                const buf = await fetchSampleImage(p.id || crypto.randomUUID());
                const key = `products/seed/${p.id}.jpg`;
                await minioClient.putObject(BUCKET_NAME, key, buf, buf.length, {
                    "Content-Type": "image/jpeg",
                });
                p.images = [getPublicObjectUrl(key)];
                await repo.save(p);
                updated++;
            } catch (e) {
                logger.warn("Product image backfill failed for one product", {
                    productId: p.id,
                    error: (e as Error).message,
                });
            }
        }
        logger.info(`Product image backfill: updated ${updated}/${targets.length} product(s)`);
    } catch (e) {
        // Non-fatal: never block boot on this.
        logger.warn("Product image backfill skipped", { error: (e as Error).message });
    } finally {
        if (!alreadyInitialised) {
            await AppDataSource.destroy();
        }
    }
}

if (require.main === module) {
    backfillProductImages(false)
        .then(() => console.log("Done - product images backfilled."))
        .catch((e) => { console.error(e); process.exit(1); });
}
