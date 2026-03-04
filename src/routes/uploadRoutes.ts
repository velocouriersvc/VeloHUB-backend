import { Router } from "express";
import { UploadController } from "../controllers/UploadController";
import { apiKeyMiddleware } from "../middleware/api-key-middleware";
import { requireRole } from "../middleware/role-middleware";
import { upload } from "../middleware/upload-middleware";

const router = Router();
const uploadController = new UploadController();

// Apply API Key to all upload routes
router.use(apiKeyMiddleware);

/**
 * @openapi
 * /uploads:
 *   post:
 *     tags: [Uploads]
 *     summary: Upload a file (image or PDF)
 *     description: |
 *       Upload a file to MinIO storage. Files are validated for type, size,
 *       and content integrity (magic bytes + suspicious content scan).
 *
 *       **Allowed types:** JPEG, PNG, WebP, HEIC/HEIF, PDF
 *       **Max size:** 10 MB
 *       **Categories:** id-cards, licenses, registration, avatars, documents
 *
 *       Returns a public URL that can be used in profile setup (e.g. idImageUrl, licensePhotoUrl).
 *     security:
 *       - ApiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - file
 *               - category
 *               - phoneNumber
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *                 description: The file to upload (max 10 MB)
 *               category:
 *                 type: string
 *                 enum: [id-cards, licenses, registration, avatars, documents]
 *                 description: Upload category — determines folder structure in storage
 *               phoneNumber:
 *                 type: string
 *                 description: User phone number for auth (e.g. +233241234567)
 *     responses:
 *       201:
 *         description: File uploaded successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: File uploaded successfully
 *                 data:
 *                   $ref: '#/components/schemas/UploadResult'
 *       400:
 *         description: Validation error (bad file type, too large, suspicious content, etc.)
 *       401:
 *         description: Missing or invalid API key / user not found
 *       500:
 *         description: Server error
 */
router.post(
  "/",
  requireRole(["buyer", "driver", "merchant"]),
  upload.single("file"),
  uploadController.uploadFile
);

/**
 * @openapi
 * /uploads/{key}:
 *   delete:
 *     tags: [Uploads]
 *     summary: Delete a file by key
 *     description: |
 *       Removes a file from MinIO storage. Users can only delete their own files
 *       (the key must contain the user's ID).
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - name: key
 *         in: path
 *         required: true
 *         description: 'Full object key, e.g. id-cards/userId/uuid.jpg'
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - phoneNumber
 *             properties:
 *               phoneNumber:
 *                 type: string
 *                 description: User phone number for auth
 *     responses:
 *       200:
 *         description: File deleted successfully
 *       400:
 *         description: Missing file key
 *       403:
 *         description: Cannot delete another user's file
 *       401:
 *         description: Missing or invalid API key / user not found
 *       500:
 *         description: Server error
 */
router.delete(
  "/*",
  requireRole(["buyer", "driver", "merchant"]),
  uploadController.deleteFile
);

/**
 * @openapi
 * /uploads/presigned/{key}:
 *   post:
 *     tags: [Uploads]
 *     summary: Get a presigned URL for temporary file access
 *     description: |
 *       Generates a time-limited signed URL for accessing a private file.
 *       Default expiry is 7 days (168 hours).
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - name: key
 *         in: path
 *         required: true
 *         description: 'Full object key, e.g. id-cards/userId/uuid.jpg'
 *         schema:
 *           type: string
 *       - name: expiry
 *         in: query
 *         required: false
 *         description: Expiry time in hours (default 168 = 7 days)
 *         schema:
 *           type: integer
 *           default: 168
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - phoneNumber
 *             properties:
 *               phoneNumber:
 *                 type: string
 *                 description: User phone number for auth
 *     responses:
 *       200:
 *         description: Presigned URL generated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Presigned URL generated
 *                 data:
 *                   type: object
 *                   properties:
 *                     url:
 *                       type: string
 *                       format: uri
 *                     expiresInHours:
 *                       type: integer
 *       400:
 *         description: Missing file key
 *       401:
 *         description: Missing or invalid API key / user not found
 *       500:
 *         description: Server error
 */
router.post(
  "/presigned/*",
  requireRole(["buyer", "driver", "merchant"]),
  uploadController.getPresignedUrl
);

export default router;
