import express from "express";
import cors from "cors";
import { config } from "./config.js";
import uploadRoutes from "./routes/upload.routes.js";
import videoRoutes from "./routes/video.routes.js";
import editRoutes from "./routes/edit.routes.js";
import skillsRoutes from "./routes/skills.routes.js";
import importRoutes from "./routes/import.routes.js";
import brandRoutes from "./routes/brand.routes.js";
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

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
