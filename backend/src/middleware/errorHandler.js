import multer from "multer";
import { AppError } from "../utils/AppError.js";
import { safeUnlink } from "../services/videoStore.js";
import { config } from "../config.js";

const MULTER_MESSAGES = {
  LIMIT_FILE_SIZE: [413, `File vượt quá giới hạn ${Math.round(config.maxFileSize / 1024 / 1024)} MB.`],
  LIMIT_FILE_COUNT: [400, "Chỉ được tải lên 1 file mỗi lần."],
  LIMIT_UNEXPECTED_FILE: [400, 'Tên field không đúng. Hãy gửi file trong field "video".'],
  LIMIT_PART_COUNT: [400, "Request có quá nhiều phần."],
  LIMIT_FIELD_COUNT: [400, "Request có quá nhiều field."],
};

export function notFound(req, _res, next) {
  next(new AppError(`Không tìm thấy ${req.method} ${req.originalUrl}`, 404, "NOT_FOUND"));
}

// eslint-disable-next-line no-unused-vars
export async function errorHandler(err, req, res, _next) {
  // Dọn file dở dang nếu lỗi xảy ra sau khi multer đã ghi file
  if (req.file?.path) await safeUnlink(req.file.path);

  let status = 500;
  let code = "INTERNAL_ERROR";
  let message = "Lỗi máy chủ. Vui lòng thử lại.";

  if (err instanceof multer.MulterError) {
    const [s, m] = MULTER_MESSAGES[err.code] ?? [400, err.message];
    status = s;
    code = err.code;
    message = m;
  } else if (err instanceof AppError) {
    status = err.statusCode;
    code = err.code;
    message = err.message;
  } else if (err?.code === "ENOSPC") {
    status = 507;
    code = "INSUFFICIENT_STORAGE";
    message = "Server hết dung lượng ổ đĩa.";
  } else if (err?.type === "entity.too.large") {
    status = 413;
    code = "PAYLOAD_TOO_LARGE";
    message = "Request quá lớn.";
  }

  if (status >= 500) console.error(`[error] ${req.method} ${req.originalUrl}`, err);

  // Client đã ngắt kết nối hoặc header đã gửi → không ghi response nữa
  if (res.headersSent || req.destroyed) return;

  res.status(status).json({ success: false, error: { code, message } });
}
