import "dotenv/config";
import path from "node:path";

const toInt = (value, fallback) => {
  const n = Number.parseInt(value ?? "", 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
};
const toNum = (value, fallback) => {
  const n = Number.parseFloat(value ?? "");
  return Number.isFinite(n) ? n : fallback;
};
const resolveDir = (value, fallback) => path.resolve(process.cwd(), value ?? fallback);

export const config = {
  port: toInt(process.env.PORT, 4000),
  corsOrigins: (process.env.CORS_ORIGIN ?? "http://localhost:3000")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
  uploadDir: resolveDir(process.env.UPLOAD_DIR, "uploads"),
  outputDir: resolveDir(process.env.OUTPUT_DIR, "outputs"),
  tmpDir: resolveDir(process.env.TMP_DIR, "tmp"),
  assetsDir: path.resolve(process.cwd(), "assets"),
  maxFileSize: toInt(process.env.MAX_FILE_SIZE_MB, 2048) * 1024 * 1024,
  uploadTtlMs: toInt(process.env.UPLOAD_TTL_HOURS, 24) * 60 * 60 * 1000,

  allowedMimeTypes: new Set([
    "video/mp4",
    "video/quicktime",
    "video/webm",
    "video/x-matroska",
    "video/x-msvideo",
    "video/avi",
  ]),
  allowedExtensions: new Set([".mp4", ".mov", ".webm", ".mkv", ".avi"]),

  /** Tuỳ chọn: Google API key (bật Drive API) → đọc thư mục Drive ổn định hơn. Để trống vẫn đọc được thư mục công khai. */
  googleApiKey: process.env.GOOGLE_API_KEY ?? "",

  // ---------- Skill (vd reel-doc-3d) ----------
  skillsDir: resolveDir(process.env.SKILLS_DIR, "skills"),
  dataDir: resolveDir(process.env.DATA_DIR, "data"),
  projectsDir: resolveDir(process.env.PROJECTS_DIR, "projects"),
  skill: {
    /** Python dùng cho skill — để trống thì tự tìm <skill>/venv */
    pythonPath: process.env.SKILL_PYTHON ?? "",
    /** Claude đọc SKILL.md và lên kịch bản edit (chọn đoạn giữ, chia cụm chữ, gán B-roll 3D) */
    anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? "",
    anthropicModel: process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5-5",
    /** Mô hình tách phông: rvm (nét) | rvm-nhe (máy yếu, nhanh gấp ~2) | u2net (dự phòng) */
    matte: process.env.SKILL_MATTE ?? "rvm",
    /**
     * Nhạc nền cho video CÓ LỜI thuyết minh (luôn dùng bài này, trừ khi chọn bài khác trên web).
     * Video KHÔNG LỜI (chill) thì AI tự chọn bài khác trong thư viện cho hợp hình, tắt tiếng gốc.
     */
    voiceMusic: process.env.SKILL_VOICE_MUSIC ?? "nhac-nen-1",
  },

  // ---------- Auto-Edit ----------
  edit: {
    /** Số job render chạy song song (4K rất nặng → nên để 1) */
    concurrency: Math.max(1, toInt(process.env.EDIT_CONCURRENCY, 1)),

    /** Ngưỡng coi là im lặng (dB). Phòng ồn → tăng lên -30; nói nhỏ → giảm xuống -40 */
    silenceThresholdDb: toNum(process.env.SILENCE_THRESHOLD_DB, -35),
    /** Khoảng lặng dài hơn mức này (giây) mới bị cắt */
    minSilenceSec: toNum(process.env.MIN_SILENCE_SEC, 0.45),
    /** Chừa lại trước/sau mỗi câu nói để không cụt chữ */
    paddingSec: toNum(process.env.SILENCE_PADDING_SEC, 0.12),

    /** libx264 (mặc định, mọi máy) | h264_videotoolbox (Mac, nhanh hơn nhiều) | h264_nvenc (NVIDIA) */
    videoEncoder: process.env.VIDEO_ENCODER ?? "libx264",
    x264Preset: process.env.X264_PRESET ?? "medium",
    x264Crf: toInt(process.env.X264_CRF, 20),
    hwBitrate: process.env.HW_BITRATE ?? "45M",

    /** Font phụ đề — phải có trên máy, hoặc thả file .ttf vào assets/fonts */
    captionFont: process.env.CAPTION_FONT ?? "Arial",

    /** Nhận diện giọng nói (OpenAI Whisper). Để trống → bỏ qua bước chèn text */
    openaiApiKey: process.env.OPENAI_API_KEY ?? "",
    whisperModel: process.env.WHISPER_MODEL ?? "whisper-1",
    transcribeLanguage: process.env.TRANSCRIBE_LANGUAGE ?? "vi",
  },
};
