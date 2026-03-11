import { Client } from "minio";
import dotenv from "dotenv";
import { createServiceLogger } from "./logger";

dotenv.config();

const log = createServiceLogger("MinIO");

const endpoint = process.env.MINIO_ENDPOINT || "localhost";
const port = parseInt(process.env.MINIO_PORT || "9000");
const useSSL = process.env.MINIO_USE_SSL === "true";
const accessKey = process.env.MINIO_ROOT_USER || "minioadmin";
const secretKey = process.env.MINIO_ROOT_PASSWORD || "minioadmin";

export const minioClient = new Client({
  endPoint: endpoint,
  port,
  useSSL,
  accessKey,
  secretKey,
});

export const BUCKET_NAME = process.env.MINIO_BUCKET || "velo-uploads";

/**
 * Ensure the bucket exists on startup.
 * Called once during app initialization.
 */
export async function ensureBucket(): Promise<void> {
  try {
    const exists = await minioClient.bucketExists(BUCKET_NAME);
    if (!exists) {
      await minioClient.makeBucket(BUCKET_NAME);
      log.info("MinIO bucket created", { bucket: BUCKET_NAME });

      // Set bucket policy to allow public read (so URLs work without signed links)
      const policy = {
        Version: "2012-10-17",
        Statement: [
          {
            Sid: "PublicRead",
            Effect: "Allow",
            Principal: "*",
            Action: ["s3:GetObject"],
            Resource: [`arn:aws:s3:::${BUCKET_NAME}/*`],
          },
        ],
      };
      await minioClient.setBucketPolicy(BUCKET_NAME, JSON.stringify(policy));
      log.info("MinIO bucket policy set to public-read");
    } else {
      log.info("MinIO bucket exists", { bucket: BUCKET_NAME });
    }
  } catch (error) {
    log.error("MinIO bucket initialization failed", { error: (error as Error).message });
  }
}
