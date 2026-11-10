import multer from "multer";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { config } from "../config.js";
import { AppError } from "../utils/AppError.js";

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, config.uploadDir),
  filename: (req, file, cb) => {
    // Không dùng tên gốc của user để lưu (tránh trùng tên / ký tự lạ / path traversal)
    const id = randomUUID();
    const ext = path.extname(file.originalname).toLowerCase();
    req.videoId = id;
    cb(null, `${id}${ext}`);
  },
});

function fileFilter(_req, file, cb) {
  const ext = path.extname(file.originalname).toLowerCase();
  const mimeOk = config.allowedMimeTypes.has(file.mimetype) || file.mimetype.startsWith("video/");
  const extOk = config.allowedExtensions.has(ext);

  // Bắt buộc đuôi file hợp lệ + mimetype là video
  if (extOk && mimeOk) return cb(null, true);

  cb(
    new AppError(
      `Định dạng không hỗ trợ. Chấp nhận: ${[...config.allowedExtensions].join(", ")}`,
      415,
      "UNSUPPORTED_FILE_TYPE",
    ),
  );
}

export const uploadVideo = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: config.maxFileSize, // 2GB
    files: 1,
    fields: 10,
    parts: 12,
  },
}).single("video"); // tên field phải khớp với FormData ở frontend
