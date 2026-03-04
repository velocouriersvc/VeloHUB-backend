import multer from "multer";

// Store files in memory (buffer) — never write to disk
// We validate and stream directly to MinIO
const storage = multer.memoryStorage();

export const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10 MB — first line of defense
    files: 1,                   // Only 1 file per request
  },
});
