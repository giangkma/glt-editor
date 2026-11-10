import { Router } from "express";
import multer from "multer";
import os from "node:os";
import { AppError } from "../utils/AppError.js";
import { ctaOverlayPath, getBrand, removeCta, saveBrandInfo, saveCta } from "../services/brand.js";

const router = Router();
const upload = multer({
  dest: os.tmpdir(),
  limits: { fileSize: 25 * 1024 * 1024, files: 1, fieldSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) =>
    file.mimetype === "image/png" ? cb(null, true) : cb(new AppError("Lớp đoạn kết phải là ảnh PNG.", 400, "INVALID_FILE")),
});

/** GET /api/brand — tên, SĐT, hashtag, đoạn kết CTA */
router.get("/", async (_req, res) => {
  res.json({ success: true, brand: await getBrand() });
});

/** PUT /api/brand { name?, phone?, hashtags? } */
router.put("/", async (req, res) => {
  res.json({ success: true, brand: await saveBrandInfo(req.body ?? {}) });
});

/** POST /api/brand/cta — multipart: overlay (PNG, tuỳ chọn), design (JSON), enabled, duration, darken */
router.post("/cta", upload.single("overlay"), async (req, res) => {
  let design;
  if (req.body?.design !== undefined) {
    try {
      design = JSON.parse(req.body.design);
    } catch {
      throw new AppError("design không phải JSON.", 400, "INVALID_OPTION");
    }
  }
  const brand = await saveCta({
    overlayTmp: req.file?.path,
    design,
    enabled: req.body?.enabled === undefined ? undefined : req.body.enabled === "true" || req.body.enabled === true,
    duration: req.body?.duration,
    darken: req.body?.darken,
  });
  res.json({ success: true, brand });
});

router.delete("/cta", async (_req, res) => {
  res.json({ success: true, brand: await removeCta() });
});

/** GET /api/brand/cta.png — lớp chữ đoạn kết (xem trước) */
router.get("/cta.png", (_req, res, next) => {
  res.set("Cache-Control", "no-store");
  res.sendFile(ctaOverlayPath(), (err) => err && !res.headersSent && next(new AppError("Chưa có đoạn kết.", 404, "NO_CTA")));
});

export default router;
