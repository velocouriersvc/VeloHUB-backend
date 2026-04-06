import { Router } from "express";
import { UploadController } from "../controllers/UploadController";
import { apiKeyMiddleware } from "../middleware/api-key-middleware";
import { requireRole, requireAuth } from "../middleware/role-middleware";
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
  requireAuth,
  upload.single("file"),
  uploadController.uploadFile
);

router.delete(
  "/*",
  requireAuth,
  uploadController.deleteFile
);

router.post(
  "/presigned/*",
  requireAuth,
  uploadController.getPresignedUrl
);

export default router;
