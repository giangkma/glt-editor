import express from "express";
import cors from "cors";
import { config } from "./config.js";
import uploadRoutes from "./routes/upload.routes.js";
import videoRoutes from "./routes/video.routes.js";
import editRoutes from "./routes/edit.routes.js";
import skillsRoutes from "./routes/skills.routes.js";
import importRoutes from "./routes/import.routes.js";
import brandRoutes from "./routes/brand.routes.js";
import path from "node:path";
import { FONT_FILES } from "./services/compose.js";
import { errorHandler, notFound } from "./middleware/errorHandler.js";
import { AppError } from "./utils/AppError.js";

export function createApp() {
  const app = express();

  app.disable("x-powered-by");
  app.use(
    cors({
      origin: (origin, cb) => {
        // Cho phép request không có origin (curl, Postman) và origin trong whitelist
        if (!origin || config.corsOrigins.includes(origin)) return cb(null, true);
        cb(new AppError(`CORS: origin ${origin} không được phép`, 403, "CORS_FORBIDDEN"));
      },
    }),
  );
  app.use(express.json({ limit: "2mb" }));
  app.use(express.urlencoded({ extended: false, limit: "100kb" }));

  app.get("/api/health", (_req, res) => res.json({ ok: true, uptime: process.uptime() }));
  app.use("/api/upload", uploadRoutes);
  app.use("/api/videos", videoRoutes);
  app.use("/api/edit", editRoutes);
  app.use("/api/skills", skillsRoutes);
  app.use("/api/import", importRoutes);
  app.use("/api/brand", brandRoutes);
  // Font của skill cho Studio (xem trước dùng đúng font của bản xuất)
  app.get("/api/fonts/:file", (req, res, next) => {
    if (!FONT_FILES.some(([f]) => f === req.params.file)) return next(new AppError("Không có font này.", 404, "NO_FONT"));
    res.set("Cache-Control", "public, max-age=86400");
    res.sendFile(path.join(config.skillsDir, "reel-doc-3d", "fonts", req.params.file), (err) => err && !res.headersSent && next(err));
  });

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
