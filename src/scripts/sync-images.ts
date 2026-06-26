import "reflect-metadata";
import { AppDataSource } from "../db/data-source";
import { UploadService, UploadCategory } from "../services/upload-service";
import axios from "axios";
import { createServiceLogger } from "../utils/logger";
import { Product } from "../models/product";
import { UserProfile } from "../models/user-profile";
import { DriverProfile } from "../models/driver-profile";
import { MerchantProfile } from "../models/merchant-profile";
import { Identification } from "../models/identification";
import { ProductCategory } from "../models/product-category";

const log = createServiceLogger("SyncImages");
const uploadService = new UploadService();

const SYSTEM_USER_ID = "00000000-0000-0000-0000-000000000000";

async function downloadFile(url: string): Promise<{ buffer: Buffer; mimeType: string; fileName: string }> {
    const response = await axios.get(url, { responseType: 'arraybuffer' });
    const buffer = Buffer.from(response.data, 'binary');
    const mimeType = response.headers['content-type'] || 'image/jpeg';
    const fileName = url.split('/').pop() || 'file.jpg';
    return { buffer, mimeType, fileName };
}

async function syncTableColumn(
    entity: any,
    columnName: string,
    category: UploadCategory,
    userIdField?: string
) {
    const repo = AppDataSource.getRepository(entity);
    const tableName = repo.metadata.tableName;
    
    // Find rows where the column contains supabase URLs
    // Using ILIKE for Postgres search
    const rows = await repo.createQueryBuilder("row")
        .where(`row.${columnName} ILIKE :url`, { url: '%supabase.co%' })
        .getMany();

    if (rows.length === 0) return;

    log.info(`Found ${rows.length} rows in ${tableName}.${columnName} to sync.`);

    for (const row of rows) {
        try {
            const url = (row as any)[columnName];
            if (!url) continue;

            log.info(`Syncing ${tableName} ID ${(row as any).id}: ${url}`);

            const { buffer, mimeType, fileName } = await downloadFile(url);
            const userId = userIdField ? (row as any)[userIdField] : SYSTEM_USER_ID;

            const result = await uploadService.uploadFile(
                buffer,
                fileName,
                mimeType,
                userId || SYSTEM_USER_ID,
                category
            );

            // Update the record with the new URL
            await repo.update((row as any).id, { [columnName]: result.url });
            log.info(`[SUCCESS] Migrated ${url} -> ${result.url}`);
        } catch (error: any) {
            log.error(`[FAILED] Error syncing row in ${tableName}: ${error.message}`);
        }
    }
}

async function syncProductImages() {
    const repo = AppDataSource.getRepository(Product);
    const products = await repo.createQueryBuilder("p")
        // Check if any element in the images array contains supabase.co
        .where("EXISTS (SELECT 1 FROM unnest(p.images) as img WHERE img ILIKE '%supabase.co%')")
        .getMany();

    if (products.length === 0) return;

    log.info(`Found ${products.length} products with Supabase images to sync.`);

    for (const product of products) {
        try {
            const newImages: string[] = [];
            let changed = false;

            for (const url of product.images) {
                if (url.includes('supabase.co')) {
                    log.info(`Syncing product ${product.id} image: ${url}`);
                    const { buffer, mimeType, fileName } = await downloadFile(url);
                    const result = await uploadService.uploadFile(
                        buffer,
                        fileName,
                        mimeType,
                        product.merchantId || SYSTEM_USER_ID,
                        "products"
                    );
                    newImages.push(result.url);
                    changed = true;
                } else {
                    newImages.push(url);
                }
            }

            if (changed) {
                await repo.update(product.id, { images: newImages });
                log.info(`[SUCCESS] Migrated images for product ${product.id}`);
            }
        } catch (error: any) {
            log.error(`[FAILED] Error syncing product ${product.id}: ${error.message}`);
        }
    }
}

async function main() {
    try {
        log.info("Starting Physical Image Migration...");
        await AppDataSource.initialize();

        // 1. User Profiles (Avatars)
        await syncTableColumn(UserProfile, "profileImageUrl", "avatars", "userId");

        // 2. Driver Profiles (Licenses)
        await syncTableColumn(DriverProfile, "licensePhotoUrl", "licenses", "userId");

        // 3. Merchant Profiles (Covers & Registration)
        await syncTableColumn(MerchantProfile, "coverImageUrl", "merchants", "userId");
        await syncTableColumn(MerchantProfile, "registrationDocUrl", "registration", "userId");

        // 4. Identifications (Ghana Card images)
        await syncTableColumn(Identification, "frontUrl", "id-cards");
        await syncTableColumn(Identification, "backUrl", "id-cards");

        // 5. Product Categories (Icons)
        await syncTableColumn(ProductCategory, "icon", "products");

        // 6. Products (Images Array)
        await syncProductImages();

        log.info("Image Migration Completed Successfully!");
    } catch (error: any) {
        log.error("Migration failed:", error);
    } finally {
        await AppDataSource.destroy();
    }
}

main();
