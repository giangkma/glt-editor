import { Router } from "express";
import { getMeta, isValidId } from "../services/videoStore.js";
import { AppError } from "../utils/AppError.js";

const router = Router();

/** GET /api/videos/:id — thông tin video (chuẩn bị cho bước Auto-Edit) */
router.get("/:id", async (req, res) => {
  const { id } = req.params;
  if (!isValidId(id)) throw new AppError("ID không hợp lệ.", 400, "INVALID_ID");

  const meta = await getMeta(id);
  if (!meta) throw new AppError("Không tìm thấy video (có thể đã hết hạn).", 404, "VIDEO_NOT_FOUND");

  // Không lộ đường dẫn tuyệt đối trên server ra ngoài
  const { path: _path, ...publicMeta } = meta;
  res.json({ success: true, video: publicMeta });
});

/** GET /api/videos/:id/file — stream file video (hỗ trợ tua nhờ Range) */
router.get("/:id/file", async (req, res, next) => {
  const meta = await getMeta(req.params.id);
  if (!meta) throw new AppError("Không tìm thấy video.", 404, "VIDEO_NOT_FOUND");
  res.sendFile(meta.path, (err) => {
    if (err && !res.headersSent) next(err);
  });
});

export default router;
