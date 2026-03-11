import { v4 as uuid } from "uuid";
import path from "path";
import crypto from "crypto";
import { minioClient, BUCKET_NAME } from "../utils/minio-client";
import { createServiceLogger } from "../utils/logger";
import { uploadEventsTotal } from "../utils/metrics";

const log = createServiceLogger("UploadService");

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
  | "documents";      // General documents

const VALID_CATEGORIES: UploadCategory[] = [
  "id-cards", "licenses", "registration", "avatars", "documents",
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

    // Upload to MinIO
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

    // In production behind a proxy, use the external URL if set
    const publicUrl =
      process.env.MINIO_PUBLIC_URL ||
      `${protocol}://${endpoint}:${port}`;

    const url = `${publicUrl}/${BUCKET_NAME}/${key}`;

    log.info("File uploaded successfully", { key, category, mimeType, size: buffer.length });
    uploadEventsTotal.inc({ category, status: "success" });

    return {
      url,
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
    await minioClient.removeObject(BUCKET_NAME, key);
  }

  /**
   * Generate a presigned URL for temporary access (7 days).
   */
  async getPresignedUrl(key: string, expirySeconds = 7 * 24 * 60 * 60): Promise<string> {
    return minioClient.presignedGetObject(BUCKET_NAME, key, expirySeconds);
  }
}
