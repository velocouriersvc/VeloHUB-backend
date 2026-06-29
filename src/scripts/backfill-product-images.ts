import "dotenv/config";
import crypto from "crypto";
import { AppDataSource } from "../db/data-source";
import { Product } from "../models/product";
import { minioClient, BUCKET_NAME } from "../utils/minio-client";
import { getPublicObjectUrl } from "../services/upload-service";

/**
 * Backfill product images into the MinIO bucket so they display in the apps and
 * to confirm the upload -> bucket -> public-URL -> /<bucket>/<key> serving works
 * end to end.
 *
 * For every product that has no usable (http/https) image, this uploads a sample
 * image to the bucket and saves the public URL on the product. Products that
 * already have a real image are left untouched (pass FORCE=1 to replace all).
 *
 * Run on the server (where MinIO + DB are reachable):
 *   npx ts-node src/scripts/backfill-product-images.ts
 *   FORCE=1 npx ts-node src/scripts/backfill-product-images.ts   # replace all
 */
async function fetchSampleImage(seed: string): Promise<Buffer> {
    // Deterministic per-product placeholder photo (so re-runs are stable).
    const url = `https://picsum.photos/seed/${encodeURIComponent(seed)}/600/600`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`image fetch failed (${res.status})`);
    return Buffer.from(await res.arrayBuffer());
}

async function run(): Promise<void> {
    const force = process.env.FORCE === "1";
    await AppDataSource.initialize();
    const repo = AppDataSource.getRepository(Product);
    const products = await repo.find();

    let updated = 0;
    let skipped = 0;
    for (const p of products) {
        const hasRemote = Array.isArray(p.images) && p.images.some((u) => /^https?:\/\//.test(u));
        if (hasRemote && !force) { skipped++; continue; }

        try {
            const buf = await fetchSampleImage(p.id || crypto.randomUUID());
            const key = `products/seed/${p.id}.jpg`;
            await minioClient.putObject(BUCKET_NAME, key, buf, buf.length, {
                "Content-Type": "image/jpeg",
            });
            const url = getPublicObjectUrl(key);
            p.images = [url];
            await repo.save(p);
            updated++;
            console.log(`OK  ${p.name} -> ${url}`);
        } catch (e) {
            console.warn(`ERR ${p.name}: ${(e as Error).message}`);
        }
    }

    console.log(`\nDone. Updated ${updated}, skipped ${skipped} (already had an image), of ${products.length} products.`);
    console.log(`Open any printed URL in a browser to confirm the bucket serving works.`);
    await AppDataSource.destroy();
}

run().catch((e) => {
    console.error(e);
    process.exit(1);
});
