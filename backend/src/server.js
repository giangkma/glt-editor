import { createApp } from "./app.js";
import { config } from "./config.js";
import { ensureUploadDir, cleanupExpired } from "./services/videoStore.js";
import { jobs } from "./services/jobs.js";
import { getCapabilities, ffmpegPath } from "./services/editor/ffmpeg.js";
import { ensureSfxFiles } from "./services/editor/pipeline.js";
import { getSettings, getSkill, syncMusic } from "./services/skills/registry.js";

// Lưới an toàn cuối cùng: log lỗi thay vì để process chết im lặng
process.on("unhandledRejection", (reason) => {
  console.error("[fatal] Unhandled Rejection:", reason);
});
process.on("uncaughtException", (err) => {
  console.error("[fatal] Uncaught Exception:", err);
  // Trạng thái process có thể đã hỏng → thoát để trình quản lý (pm2/docker) khởi động lại
  process.exit(1);
});

async function main() {
  await ensureUploadDir();
  await cleanupExpired();
  const cleanupTimer = setInterval(cleanupExpired, 60 * 60 * 1000); // mỗi giờ
  cleanupTimer.unref();

  // Kiểm tra FFmpeg ngay khi khởi động để báo lỗi sớm, rõ ràng
  try {
    const caps = await getCapabilities();
    console.log(`🎬 FFmpeg OK (${ffmpegPath}) — libass: ${caps.ass ? "có" : "KHÔNG"}`);
    if (!caps.ass) {
      console.log("   → Bộ edit Cơ bản sẽ không chèn được text. Sửa: brew install ffmpeg-full  rồi khởi động lại backend (web tự dùng).");
    }
  } catch (err) {
    console.error("⚠️  Không chạy được FFmpeg. Cài bằng: brew install ffmpeg  (hoặc đặt FFMPEG_PATH trong .env)");
    console.error("   Chi tiết:", err.message);
  }
  try {
    await ensureSfxFiles();
  } catch (err) {
    console.error("⚠️  Không tạo được file SFX:", err.message);
  }

  // Skill mặc định (dùng cho mọi lần edit)
  try {
    const { defaultSkill } = await getSettings();
    const skill = defaultSkill ? await getSkill(defaultSkill) : null;
    if (skill) {
      const s = skill.status;
      console.log(`🎨 Skill mặc định: ${skill.name} — python: ${s.python ? "có" : "CHƯA"} · font: ${s.fonts ? "có" : "CHƯA"} · tách phông RVM: ${s.matteModel ? "có" : "chưa (dùng u2net)"}`);
      if (!s.python || !s.fonts) console.log("   → chạy: npm run skill:setup");
      // Quét thư viện nhạc (nhac_nen_voice / nhac_nen_chill) ở nền — bài mới thả vào được chuẩn bị sẵn
      syncMusic(skill.id)
        .then((r) => r && console.log(`🎵 Nhạc: ${r.cats.voice.length} bài voice · ${r.cats.chill.length} bài chill${r.message ? ` (${r.message})` : ""}`))
        .catch((err) => console.error("[nhạc]", err.message));
    } else {
      console.log("🎨 Chưa có skill mặc định → dùng bộ edit cơ bản (FFmpeg). Cài skill ở trang /skills.");
    }
  } catch (err) {
    console.error("[skills]", err.message);
  }

  const app = createApp();
  const server = app.listen(config.port, () => {
    console.log(`🚀 Backend chạy tại http://localhost:${config.port}`);
    console.log(`   Upload dir : ${config.uploadDir}`);
    console.log(`   CORS       : ${config.corsOrigins.join(", ")}`);
  });

  // Node mặc định cắt request sau 5 phút → không đủ cho file 2GB trên mạng chậm
  server.requestTimeout = 0; // tắt giới hạn tổng thời gian request
  server.headersTimeout = 60_000;
  server.keepAliveTimeout = 65_000;

  const shutdown = (signal) => {
    console.log(`\n[${signal}] Đang tắt server...`);
    jobs.abortAll(); // dừng mọi tiến trình FFmpeg đang chạy
    server.close(() => process.exit(0));
    server.closeAllConnections(); // đóng các kết nối SSE đang mở
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

main().catch((err) => {
  console.error("[fatal] Không khởi động được server:", err);
  process.exit(1);
});
