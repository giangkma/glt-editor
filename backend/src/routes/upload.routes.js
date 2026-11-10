import { Router } from "express";
import { uploadVideo } from "../middleware/upload.js";
import { saveMeta, safeUnlink } from "../services/videoStore.js";
import { AppError } from "../utils/AppError.js";

const router = Router();

/**
 * Busboy (bên trong multer) có thể giải mã tên file UTF-8 thành latin1
 * → "Video_Äá»..." Hàm này sửa lại, và giữ nguyên nếu tên đã đúng.
 */
function decodeFileName(name) {
  if (/[^\u0000-\u00ff]/.test(name)) return name; // đã là unicode chuẩn
  const decoded = Buffer.from(name, "latin1").toString("utf8");
  return decoded.includes("\uFFFD") ? name : decoded;
}

/**
 * POST /api/upload
 * multipart/form-data, field: "video"
 */
router.post("/", (req, res, next) => {
  // Nếu client huỷ giữa chừng (bấm "Huỷ" ở frontend / mất mạng) → xoá file dở dang
  // (res "close" trước khi gửi xong response = kết nối bị ngắt)
  res.on("close", () => {
    if (!res.writableFinished && req.file?.path) safeUnlink(req.file.path);
  });

  uploadVideo(req, res, async (err) => {
    if (err) return next(err);

    try {
      if (!req.file) {
        throw new AppError('Không có file nào được gửi lên (field "video").', 400, "NO_FILE");
      }

      const { filename, originalname, mimetype, size, path: filePath } = req.file;
      const id = req.videoId;

      const meta = {
        id,
        filename,
        originalName: decodeFileName(originalname), // giữ đúng tên tiếng Việt
        mimeType: mimetype,
        size,
        path: filePath,
        status: "uploaded",
        createdAt: new Date().toISOString(),
      };
      await saveMeta(meta);

      console.log(`[upload] ${meta.originalName} → ${filename} (${(size / 1024 / 1024).toFixed(1)} MB)`);

      res.status(201).json({
        success: true,
        message: "Tải lên thành công.",
        id,
        video: {
          id,
          originalName: meta.originalName,
          size,
          mimeType: mimetype,
          url: `/api/videos/${id}`,
        },
      });
    } catch (e) {
      if (req.file?.path) await safeUnlink(req.file.path);
      next(e);
    }
  });
});

export default router;
