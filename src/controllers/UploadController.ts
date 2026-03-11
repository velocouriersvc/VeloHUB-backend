import { Response } from "express";
import { UploadService, UploadCategory } from "../services/upload-service";
import { AuthRequest } from "../middleware/role-middleware";
import { createServiceLogger } from "../utils/logger";

const log = createServiceLogger("UploadController");

export class UploadController {
  private uploadService = new UploadService();

  /**
   * POST /uploads
   * Multipart form-data: file + category
   */
  uploadFile = async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ message: "User ID required" });
      }

      const file = req.file;
      if (!file) {
        return res.status(400).json({ message: "No file provided. Send a file in the 'file' field." });
      }

      const { category } = req.body;
      if (!category) {
        return res.status(400).json({
          message: "Missing 'category' field. Valid: id-cards, licenses, registration, avatars, documents",
        });
      }

      const result = await this.uploadService.uploadFile(
        file.buffer,
        file.originalname,
        file.mimetype,
        userId,
        category as UploadCategory
      );

      return res.status(201).json({
        message: "File uploaded successfully",
        data: result,
      });
    } catch (error: any) {
      // Validation errors from UploadService
      if (
        error.message?.includes("not allowed") ||
        error.message?.includes("too large") ||
        error.message?.includes("does not match") ||
        error.message?.includes("suspicious") ||
        error.message?.includes("Invalid category") ||
        error.message?.includes("empty")
      ) {
        return res.status(400).json({ message: error.message });
      }

      log.error("Upload error", { error: error.message });
      return res.status(500).json({ message: "Internal server error" });
    }
  };

  /**
   * DELETE /uploads/:key(*)
   * Delete a file from MinIO by its object key.
   */
  deleteFile = async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ message: "User ID required" });
      }

      // The key comes as a wildcard param — e.g. id-cards/userId/uuid.jpg
      const key = req.params[0] || req.params.key;
      if (!key) {
        return res.status(400).json({ message: "File key is required" });
      }

      // Security: users can only delete their own files
      if (!key.includes(`/${userId}/`)) {
        return res.status(403).json({ message: "You can only delete your own files" });
      }

      await this.uploadService.deleteFile(key);

      return res.status(200).json({ message: "File deleted successfully" });
    } catch (error) {
      log.error("Delete file error", { error: (error as Error).message });
      return res.status(500).json({ message: "Internal server error" });
    }
  };

  /**
   * GET /uploads/presigned/:key(*)
   * Get a temporary presigned URL for a file.
   */
  getPresignedUrl = async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ message: "User ID required" });
      }

      const key = req.params[0] || req.params.key;
      if (!key) {
        return res.status(400).json({ message: "File key is required" });
      }

      const expiryHours = parseInt(req.query.expiry as string) || 168; // default 7 days
      const url = await this.uploadService.getPresignedUrl(key, expiryHours * 3600);

      return res.status(200).json({
        message: "Presigned URL generated",
        data: { url, expiresInHours: expiryHours },
      });
    } catch (error) {
      log.error("Presigned URL error", { error: (error as Error).message });
      return res.status(500).json({ message: "Internal server error" });
    }
  };
}
