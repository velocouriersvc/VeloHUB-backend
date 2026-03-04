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
 *       Returns a public URL that you pass to profile setup endpoints (e.g. `idImageUrl`, `licensePhotoUrl`).
 *
 *       **Roles:** buyer, driver, merchant
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
 *                 description: The file to upload (max 10 MB). Allowed — JPEG, PNG, WebP, HEIC, PDF.
 *               category:
 *                 type: string
 *                 enum: [id-cards, licenses, registration, avatars, documents]
 *                 example: id-cards
 *                 description: Upload category — determines folder structure in storage
 *               phoneNumber:
 *                 type: string
 *                 example: "+233501234567"
 *                 description: Your registered phone number for auth
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
 *         description: Validation error (bad file type, too large, suspicious content, missing category)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: Missing or invalid API key / user not found
 *       403:
 *         description: Role not approved
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
 *
 *       **Roles:** buyer, driver, merchant
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - name: key
 *         in: path
 *         required: true
 *         description: 'Full object key, e.g. id-cards/userId/uuid.jpg'
 *         schema:
 *           type: string
 *         example: "id-cards/abc123/550e8400-e29b.jpg"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/PhoneOnlyBody'
 *           example:
 *             phoneNumber: "+233501234567"
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
 *
 *       **Roles:** buyer, driver, merchant
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - name: key
 *         in: path
 *         required: true
 *         description: 'Full object key, e.g. id-cards/userId/uuid.jpg'
 *         schema:
 *           type: string
 *         example: "id-cards/abc123/550e8400-e29b.jpg"
 *       - name: expiry
 *         in: query
 *         required: false
 *         description: Expiry time in hours (default 168 = 7 days)
 *         schema:
 *           type: integer
 *           default: 168
 *         example: 24
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/PhoneOnlyBody'
 *           example:
 *             phoneNumber: "+233501234567"
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
 *                       example: "http://minio-service:9000/velo-uploads/id-cards/abc123/photo.jpg?X-Amz-..."
 *                     expiresInHours:
 *                       type: integer
 *                       example: 24
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
