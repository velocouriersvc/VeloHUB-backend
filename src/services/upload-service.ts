import { v4 as uuid } from "uuid";
import path from "path";
import crypto from "crypto";
import { minioClient, BUCKET_NAME } from "../utils/minio-client";
import { createServiceLogger } from "../utils/logger";
import { uploadEventsTotal } from "../utils/metrics";

const log = createServiceLogger("UploadService");
const DEFAULT_PUBLIC_ASSETS_URL = "https://api.velocouriersvc.com";

function normalizePublicBaseUrl(raw?: string | null): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  return withProtocol.replace(/\/+$/, "");
}

function getPublicAssetsBaseUrl(): string | null {
  const candidates = [
    process.env.MINIO_PUBLIC_URL,
    process.env.PUBLIC_ASSETS_URL,
    process.env.PUBLIC_BASE_URL,
    process.env.API_PUBLIC_URL,
    process.env.APP_PUBLIC_URL,
    DEFAULT_PUBLIC_ASSETS_URL,
  ];
  for (const candidate of candidates) {
    const normalized = normalizePublicBaseUrl(candidate);
    if (normalized) {
      return normalized.replace(/\/api\/v1$/i, "");
    }
  }
  return null;
}

export function getPublicObjectUrl(key: string): string {
  const publicBase = getPublicAssetsBaseUrl() || DEFAULT_PUBLIC_ASSETS_URL;
  return `${publicBase}/${BUCKET_NAME}/${key}`;
}

export function rewriteToPublicAssetUrl(url?: string | null): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  if (!trimmed) return null;

  const bucketPattern = new RegExp(`/${BUCKET_NAME}/(.+)$`, "i");
  const bucketMatch = trimmed.match(bucketPattern);
  if (bucketMatch?.[1]) {
    return getPublicObjectUrl(bucketMatch[1]);
  }

  const uploadsMatch = trimmed.match(/\/uploads\/(.+)$/i);
  if (uploadsMatch?.[1]) {
    return getPublicObjectUrl(uploadsMatch[1]);
  }

  return trimmed;
}

// ─── Security Config ────────────────────────────────────────────────

/** Allowed MIME types — only images and PDFs */
const ALLOWED_MIME_TYPES: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/heic": ".heic",
  "image/heif": ".heif",
  "application/pdf": ".pdf",
};

/** Max file size: 10 MB */
const MAX_FILE_SIZE = 10 * 1024 * 1024;

/** Magic bytes to verify actual file type (not just Content-Type header) */
const MAGIC_BYTES: Record<string, Buffer> = {
  "image/jpeg": Buffer.from([0xff, 0xd8, 0xff]),
  "image/png": Buffer.from([0x89, 0x50, 0x4e, 0x47]),
  "image/webp": Buffer.from("RIFF"),
  "application/pdf": Buffer.from("%PDF"),
};

/** Upload categories — controls folder structure in MinIO */
export type UploadCategory =
  | "id-cards"        // Ghana Card images
  | "licenses"        // Driver's license photos
  | "registration"    // Business registration docs
  | "avatars"         // Profile photos
  | "documents"       // General documents
  | "products"        // Product images
  | "merchants";      // Merchant cover images, logos

const VALID_CATEGORIES: UploadCategory[] = [
  "id-cards", "licenses", "registration", "avatars", "documents", "products", "merchants",
];

// ─── Validation ─────────────────────────────────────────────────────

export interface UploadValidationResult {
  valid: boolean;
  error?: string;
}

export interface UploadResult {
  url: string;
  key: string;
  bucket: string;
  size: number;
  mimeType: string;
  checksum: string;
}

function validateFile(
  buffer: Buffer,
  originalName: string,
  mimeType: string,
  size: number
): UploadValidationResult {
  // 1. Check size
  if (size > MAX_FILE_SIZE) {
    return { valid: false, error: `File too large. Max size is ${MAX_FILE_SIZE / (1024 * 1024)}MB` };
  }

  if (size === 0) {
    return { valid: false, error: "File is empty" };
  }

  // 2. Check MIME type
  if (!ALLOWED_MIME_TYPES[mimeType]) {
    return {
      valid: false,
      error: `File type "${mimeType}" is not allowed. Allowed: ${Object.keys(ALLOWED_MIME_TYPES).join(", ")}`,
    };
  }

  // 3. Check file extension matches MIME
  const ext = path.extname(originalName).toLowerCase();
  const expectedExt = ALLOWED_MIME_TYPES[mimeType];
  const extAliases: Record<string, string[]> = {
    ".jpg": [".jpg", ".jpeg"],
    ".heic": [".heic", ".heif"],
    ".heif": [".heic", ".heif"],
  };
  const validExts = extAliases[expectedExt] || [expectedExt];
  if (!validExts.includes(ext)) {
    return {
      valid: false,
      error: `File extension "${ext}" does not match content type "${mimeType}"`,
    };
  }

  // 4. Verify magic bytes (actual file content, not just header)
  const magic = MAGIC_BYTES[mimeType];
  if (magic) {
    const fileHeader = buffer.subarray(0, magic.length);
    // For RIFF (webp), check if RIFF is at start and WEBP follows at offset 8
    if (mimeType === "image/webp") {
      const isRiff = fileHeader.toString("ascii").startsWith("RIFF");
      const hasWebp = buffer.length >= 12 && buffer.subarray(8, 12).toString("ascii") === "WEBP";
      if (!isRiff || !hasWebp) {
        return { valid: false, error: "File content does not match claimed type (webp)" };
      }
    } else if (!fileHeader.equals(magic)) {
      return { valid: false, error: "File content does not match claimed type" };
    }
  }

  // 5. Check for suspicious content (embedded scripts, polyglots)
  const headerStr = buffer.subarray(0, Math.min(buffer.length, 1024)).toString("utf8", 0, 1024);
  const suspiciousPatterns = [
    /<script/i,
    /javascript:/i,
    /<%/,
    /<\?php/i,
    /eval\s*\(/i,
    /document\./i,
  ];
  for (const pattern of suspiciousPatterns) {
    if (pattern.test(headerStr)) {
      return { valid: false, error: "File contains suspicious content" };
    }
  }

  return { valid: true };
}

function validateCategory(category: string): UploadValidationResult {
  if (!VALID_CATEGORIES.includes(category as UploadCategory)) {
    return {
      valid: false,
      error: `Invalid category "${category}". Valid: ${VALID_CATEGORIES.join(", ")}`,
    };
  }
  return { valid: true };
}

// ─── Upload Service ─────────────────────────────────────────────────

export class UploadService {
  /**
   * Upload a file to MinIO with full validation.
   *
   * Files are stored as: {category}/{userId}/{uuid}{ext}
   * e.g. id-cards/abc123/550e8400-e29b-41d4-a716-446655440000.jpg
   */
  async uploadFile(
    buffer: Buffer,
    originalName: string,
    mimeType: string,
    userId: string,
    category: UploadCategory
  ): Promise<UploadResult> {
    // Validate category
    const catCheck = validateCategory(category);
    if (!catCheck.valid) throw new Error(catCheck.error);

    // Validate file
    const fileCheck = validateFile(buffer, originalName, mimeType, buffer.length);
    if (!fileCheck.valid) throw new Error(fileCheck.error);

    // Generate safe filename — never use the original name
    const ext = ALLOWED_MIME_TYPES[mimeType];
    const fileId = uuid();
    const key = `${category}/${userId}/${fileId}${ext}`;

    // SHA-256 checksum for integrity
    const checksum = crypto.createHash("sha256").update(buffer).digest("hex");

    const USE_LOCAL_STORAGE = process.env.USE_LOCAL_STORAGE === "true";

    if (USE_LOCAL_STORAGE) {
      // ─── Local Storage Fallback ────────────────────────────────────
      const fs = require("fs").promises;
      const localPath = path.join(process.cwd(), "public", "uploads", key);
      const dir = path.dirname(localPath);

      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(localPath, buffer);

      const port = process.env.PORT || "3000";
      const url = `http://localhost:${port}/uploads/${key}`;

      log.info("File uploaded locally", { key, category, url });
      uploadEventsTotal.inc({ category, status: "success" });

      return {
        url,
        key,
        bucket: "local",
        size: buffer.length,
        mimeType,
        checksum,
      };
    }

    // ─── MinIO Storage ──────────────────────────────────────────────
    await minioClient.putObject(BUCKET_NAME, key, buffer, buffer.length, {
      "Content-Type": mimeType,
      "x-amz-checksum-sha256": checksum,
      "x-amz-meta-original-name": encodeURIComponent(originalName),
      "x-amz-meta-user-id": userId,
      "x-amz-meta-category": category,
    });

    // Build the public URL
    const endpoint = process.env.MINIO_ENDPOINT || "localhost";
    const port = process.env.MINIO_PORT || "9000";
    const useSSL = process.env.MINIO_USE_SSL === "true";
    const protocol = useSSL ? "https" : "http";

    // In production behind a proxy, use external base URL if set.
    // This avoids leaking internal hostnames like minio-service to mobile clients.
    const externalBase = getPublicAssetsBaseUrl();
    const publicUrl =
      externalBase ||
      `${protocol}://${endpoint}:${port}`;

    const url = `${publicUrl}/${BUCKET_NAME}/${key}`;

    log.info("File uploaded successfully", { key, category, mimeType, size: buffer.length });
    uploadEventsTotal.inc({ category, status: "success" });

    return {
      url: rewriteToPublicAssetUrl(url) || url,
      key,
      bucket: BUCKET_NAME,
      size: buffer.length,
      mimeType,
      checksum,
    };
  }

  /**
   * Delete a file from MinIO by its key.
   */
  async deleteFile(key: string): Promise<void> {
    const USE_LOCAL_STORAGE = process.env.USE_LOCAL_STORAGE === "true";
    if (USE_LOCAL_STORAGE) {
      const fs = require("fs").promises;
      const localPath = path.join(process.cwd(), "public", "uploads", key);
      try {
        await fs.unlink(localPath);
        log.info("File deleted locally", { key });
      } catch (err) {
        log.warn("Local file deletion failed", { key, error: (err as Error).message });
      }
      return;
    }
    await minioClient.removeObject(BUCKET_NAME, key);
  }

  /**
   * Generate a presigned URL for temporary access (7 days).
   */
  async getPresignedUrl(key: string, expirySeconds = 7 * 24 * 60 * 60): Promise<string> {
    const USE_LOCAL_STORAGE = process.env.USE_LOCAL_STORAGE === "true";
    if (USE_LOCAL_STORAGE) {
      const port = process.env.PORT || "3000";
      return `http://localhost:${port}/uploads/${key}`;
    }
    return minioClient.presignedGetObject(BUCKET_NAME, key, expirySeconds);
  }
}
