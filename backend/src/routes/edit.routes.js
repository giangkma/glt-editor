import { Router } from "express";
import path from "node:path";
import { getMeta, isValidId } from "../services/videoStore.js";
import { jobs, isTerminal } from "../services/jobs.js";
import { AppError } from "../utils/AppError.js";
import { resolveSkill } from "../services/skills/registry.js";
import multer from "multer";
import os from "node:os";
import { coverFiles, INSERT_CHOICES } from "../services/cover.js";
import { makeSuggestions, readSuggestions } from "../services/suggest.js";
import { getScript } from "../services/skills/revise.js";

const coverUpload = multer({
  dest: os.tmpdir(),
  limits: { fileSize: 25 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) =>
    file.mimetype === "image/png" ? cb(null, true) : cb(new AppError("Lớp chữ phải là ảnh PNG.", 400, "INVALID_FILE")),
});

const router = Router();

/** Lấy job theo :jobId hoặc báo 404 */
function requireJob(req) {
  const { jobId } = req.params;
  const job = isValidId(jobId) ? jobs.get(jobId) : null;
  if (!job) throw new AppError("Không tìm thấy job (có thể server đã khởi động lại).", 404, "JOB_NOT_FOUND");
  return job;
}

/** Kiểm tra & lọc options do client gửi lên */
function parseBasicOptions(raw = {}) {
  const opts = { pipeline: "basic" };
  if (typeof raw.captions === "boolean") opts.captions = raw.captions;
  if (typeof raw.sfx === "boolean") opts.sfx = raw.sfx;
  if (raw.silenceThresholdDb !== undefined) {
    const v = Number(raw.silenceThresholdDb);
    if (!Number.isFinite(v) || v < -70 || v > -10) {
      throw new AppError("silenceThresholdDb phải nằm trong khoảng -70 đến -10.", 400, "INVALID_OPTION");
    }
    opts.silenceThresholdDb = v;
  }
  if (raw.minSilenceSec !== undefined) {
    const v = Number(raw.minSilenceSec);
    if (!Number.isFinite(v) || v < 0.2 || v > 5) {
      throw new AppError("minSilenceSec phải nằm trong khoảng 0.2 đến 5 giây.", 400, "INVALID_OPTION");
    }
    opts.minSilenceSec = v;
  }
  return opts;
}

function parseSkillOptions(raw = {}, skill) {
  const opts = { pipeline: "skill", skillId: skill.id, mode: raw.mode === "final" ? "final" : "draft" };
  opts.export4k = raw.export4k === true;
  opts.fps60 = opts.export4k && raw.fps60 === true; // 4K 60fps
  if (raw.music !== undefined) {
    const list = Array.isArray(raw.music) ? raw.music : [raw.music];
    // "auto" = AI tự chọn bài (montage) / bài đầu thư viện (video có lời)
    const unknown = list.filter((m) => m !== "auto" && !skill.music.includes(m));
    if (unknown.length) throw new AppError(`Không có nhạc nền: ${unknown.join(", ")}`, 400, "INVALID_OPTION");
    opts.music = list.slice(0, 3);
  }
  if (raw.montage !== undefined) {
    // auto (mặc định): video không lời → montage theo nhạc | on: luôn montage | off: luôn edit kiểu nói chuyện
    if (!["auto", "on", "off"].includes(raw.montage)) throw new AppError("montage phải là auto, on hoặc off.", 400, "INVALID_OPTION");
    opts.montage = raw.montage;
  }
  if (raw.videoType !== undefined) {
    // voice: video có lời thuyết minh (nhạc từ thư mục voice) | chill: video không lời (montage, nhạc thư mục chill, tắt tiếng gốc)
    if (!["voice", "chill"].includes(raw.videoType)) throw new AppError("videoType phải là voice hoặc chill.", 400, "INVALID_OPTION");
    opts.videoType = raw.videoType;
    opts.montage = raw.videoType === "chill" ? "on" : "off";
  }
  // Nâng cấp chất lượng (09/11/2026)
  const bool = (k, def) => (typeof raw[k] === "boolean" ? raw[k] : def);
  opts.hook = bool("hook", true); // câu / cảnh móc 3 giây đầu
  opts.cta = bool("cta", true); // gắn đoạn kết thương hiệu (nếu đã bật trong trang Thương hiệu)
  opts.stabilize = bool("stabilize", false); // chống rung
  opts.denoise = bool("denoise", true); // lọc gió / tiếng ồn (video voice)
  opts.reframe = bool("reframe", true); // clip ngang: khung dọc đi theo người
  if (raw.grade !== undefined) {
    if (!["tu-dong", "tu-nhien", "rung-tuoi", "hoang-hon", "dien-anh"].includes(raw.grade)) {
      throw new AppError("grade không hợp lệ.", 400, "INVALID_OPTION");
    }
    opts.grade = raw.grade;
  }
  if (raw.captionStyle !== undefined) {
    if (!["tung-tu", "cum"].includes(raw.captionStyle)) throw new AppError("captionStyle phải là tung-tu hoặc cum.", 400, "INVALID_OPTION");
    opts.captionStyle = raw.captionStyle;
  }
  if (raw.transition !== undefined) {
    if (!["muot", "manh"].includes(raw.transition)) throw new AppError("transition phải là muot hoặc manh.", 400, "INVALID_OPTION");
    opts.transition = raw.transition;
  }
  if (raw.matte !== undefined) {
    if (!["rvm", "rvm-nhe", "u2net"].includes(raw.matte)) throw new AppError("matte không hợp lệ.", 400, "INVALID_OPTION");
    opts.matte = raw.matte;
  }
  return opts;
}

/**
 * POST /api/edit
 * Body: { videoId | videoIds: string[] (nhiều clip → ghép 1 reel, chỉ với skill), options? }
 *   options.style: bỏ trống = skill mặc định (nếu có) | "basic" = bộ FFmpeg cơ bản | "<id skill>"
 *   Skill:  { mode: "draft"|"final", export4k?, music?: string[], matte? }
 *   Cơ bản: { captions?, sfx?, silenceThresholdDb?, minSilenceSec? }
 * → 202 { success, jobId, eventsUrl, job }
 */
router.post("/", async (req, res) => {
  const { videoId, videoIds, options } = req.body ?? {};
  // Nhiều clip → ghép thành 1 reel (theo thứ tự gửi lên). Vẫn nhận videoId đơn như cũ.
  const ids = Array.isArray(videoIds) ? videoIds : [videoId];
  if (!ids.length || ids.length > 20 || !ids.every(isValidId)) {
    throw new AppError("Thiếu hoặc sai videoId / videoIds (tối đa 20 clip).", 400, "INVALID_VIDEO_ID");
  }
  if (new Set(ids).size !== ids.length) throw new AppError("Một clip bị gửi trùng 2 lần.", 400, "DUPLICATE_VIDEO");

  const videos = [];
  for (const id of ids) {
    const v = await getMeta(id);
    if (!v) throw new AppError("Không tìm thấy video (có thể đã hết hạn).", 404, "VIDEO_NOT_FOUND");
    videos.push(v);
  }

  const style = options?.style;
  const skill = style === "basic" ? null : await resolveSkill(style === undefined || style === null ? undefined : String(style));
  if (!skill && videos.length > 1) {
    throw new AppError("Bộ edit Cơ bản chỉ nhận 1 video. Ghép nhiều clip → chọn phong cách skill.", 400, "BASIC_SINGLE_VIDEO");
  }
  const opts = skill ? { ...parseSkillOptions(options, skill), videos } : parseBasicOptions(options);
  const job = jobs.create(videos[0], opts);
  res.status(202).json({
    success: true,
    jobId: job.id,
    eventsUrl: `/api/edit/${job.id}/events`,
    job,
  });
});

/** POST /api/edit/:jobId/finalize — duyệt bản nháp → dựng bản chính { export4k? } */
router.post("/:jobId/finalize", (req, res) => {
  const draft = requireJob(req);
  const export4k = typeof req.body?.export4k === "boolean" ? req.body.export4k : undefined;
  const fps60 = typeof req.body?.fps60 === "boolean" ? req.body.fps60 : undefined;
  const job = jobs.finalize(draft.id, { export4k, fps60 });
  res.status(202).json({ success: true, jobId: job.id, eventsUrl: `/api/edit/${job.id}/events`, job });
});

/** GET /api/edit/:jobId — trạng thái hiện tại (dự phòng khi không dùng được SSE) */
router.get("/:jobId", (req, res) => {
  res.json({ success: true, job: jobs.snapshot(requireJob(req)) });
});

/**
 * GET /api/edit/:jobId/events — Server-Sent Events
 *   event: progress  → mỗi lần % / giai đoạn thay đổi
 *   event: done | failed | cancelled → kết thúc, server đóng kết nối
 *   (dùng "failed" thay vì "error" vì "error" trùng sự kiện lỗi kết nối của EventSource)
 */
router.get("/:jobId/events", (req, res) => {
  const job = requireJob(req);

  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no", // tắt buffer nếu chạy sau Nginx
  });
  res.flushHeaders();

  const send = (snapshot) => {
    const event = !isTerminal(snapshot.status) ? "progress" : snapshot.status === "error" ? "failed" : snapshot.status;
    res.write(`event: ${event}\ndata: ${JSON.stringify(snapshot)}\n\n`);
    if (isTerminal(snapshot.status)) cleanup(true);
  };

  const onUpdate = (snapshot) => {
    if (snapshot.id === job.id) send(snapshot);
  };

  // Comment ":" giữ kết nối không bị proxy/trình duyệt cắt khi render lâu
  const heartbeat = setInterval(() => res.write(": ping\n\n"), 15_000);

  let closed = false;
  function cleanup(end = false) {
    if (closed) return;
    closed = true;
    clearInterval(heartbeat);
    jobs.off("update", onUpdate);
    if (end) res.end();
  }

  res.write("retry: 3000\n\n"); // trình duyệt tự kết nối lại sau 3s nếu rớt mạng
  jobs.on("update", onUpdate);
  req.on("close", () => cleanup(false));

  // Gửi ngay trạng thái hiện tại (client kết nối muộn vẫn thấy đúng %)
  send(jobs.snapshot(job));
});

/**
 * POST /api/edit/:jobId/cover — multipart: overlay (PNG lớp chữ 2160×3840), time (giây), insert (0 | 0.1 | 1)
 * → 202 { job } ; tiến trình nằm trong job.cover (GET /api/edit/:jobId để xem)
 */
router.post("/:jobId/cover", coverUpload.single("overlay"), (req, res) => {
  const job = requireJob(req);
  if (!req.file) throw new AppError("Thiếu lớp chữ (overlay).", 400, "MISSING_FILE");
  const time = Number(req.body?.time);
  const insert = Number(req.body?.insert ?? 0.1);
  if (!Number.isFinite(time) || time < 0) throw new AppError("Mốc giây không hợp lệ.", 400, "INVALID_OPTION");
  if (!INSERT_CHOICES.includes(insert)) throw new AppError("insert phải là 0, 0.1 hoặc 1.", 400, "INVALID_OPTION");
  const snap = jobs.setCover(job.id, { overlayPath: req.file.path, time, insert });
  res.status(202).json({ success: true, job: snap });
});

/** GET /api/edit/:jobId/suggest — gợi ý đã có (không tốn token) */
router.get("/:jobId/suggest", async (req, res) => {
  const job = requireJob(req);
  res.json({ success: true, suggestions: await readSuggestions(job.id) });
});

/** POST /api/edit/:jobId/suggest — AI xem video, viết caption + hashtag + chữ ảnh bìa */
router.post("/:jobId/suggest", async (req, res) => {
  const job = requireJob(req);
  const ctrl = new AbortController();
  req.on("close", () => !res.writableEnded && ctrl.abort());
  res.json({ success: true, suggestions: await makeSuggestions(job, { signal: ctrl.signal }) });
});

/** GET /api/edit/:jobId/script — kịch bản chỉnh được của bản nháp (chữ phụ đề, cảnh, nhạc) */
router.get("/:jobId/script", async (req, res) => {
  const job = requireJob(req);
  res.json({ success: true, script: await getScript(job) });
});

/** POST /api/edit/:jobId/revise — chỉnh nhanh rồi dựng lại bản nháp (không gọi AI) → 202 { job } */
router.post("/:jobId/revise", async (req, res) => {
  const job = requireJob(req);
  const next = await jobs.revise(job.id, req.body ?? {});
  res.status(202).json({ success: true, jobId: next.id, eventsUrl: `/api/edit/${next.id}/events`, job: next });
});

/** DELETE /api/edit/:jobId/cover — bỏ ảnh bìa */
router.delete("/:jobId/cover", async (req, res) => {
  const job = requireJob(req);
  res.json({ success: true, job: await jobs.clearCover(job.id) });
});

/** GET /api/edit/:jobId/cover.jpg — ảnh bìa (?download=1 để tải) */
router.get("/:jobId/cover.jpg", (req, res, next) => {
  const job = requireJob(req);
  if (job.cover?.status !== "done") throw new AppError("Chưa có ảnh bìa.", 404, "NO_COVER");
  const file = coverFiles(job.id).image;
  res.set("Cache-Control", "no-store");
  const cb = (err) => err && !res.headersSent && next(err);
  if (req.query.download) res.download(file, `${downloadBase(job)}_bia.jpg`, cb);
  else res.sendFile(file, cb);
});

const downloadBase = (job) =>
  path.parse(job.videoName ?? "video").name.replace(/[^\p{L}\p{N}_\- ]/gu, "").trim() || "video";

/** Video có bìa (nếu đã chèn) — ?cover=1 trên /file và /download */
const outputFor = (req, job) =>
  req.query.cover && job.cover?.status === "done" && job.cover.hasVideo ? coverFiles(job.id).video : job._outputPath;

/** GET /api/edit/:jobId/file — xem video kết quả (hỗ trợ tua) */
router.get("/:jobId/file", (req, res, next) => {
  const job = requireJob(req);
  if (job.status !== "done" || !job._outputPath) {
    throw new AppError("Video chưa render xong.", 409, "NOT_READY");
  }
  res.sendFile(outputFor(req, job), (err) => {
    if (err && !res.headersSent) next(err);
  });
});

/** GET /api/edit/:jobId/download — tải file .mp4 */
router.get("/:jobId/download", (req, res, next) => {
  const job = requireJob(req);
  if (job.status !== "done" || !job._outputPath) {
    throw new AppError("Video chưa render xong.", 409, "NOT_READY");
  }
  const base = downloadBase(job);
  const suffix = job.pipeline === "skill" ? (job.mode === "draft" ? "nhap720" : job._options.export4k ? (job._options.fps60 ? "reel_4k60" : "reel_4k") : "reel") : "autoedit_4k";
  const file = outputFor(req, job);
  res.download(file, `${base}_${suffix}${file === job._outputPath ? "" : "_bia"}.mp4`, (err) => {
    if (err && !res.headersSent) next(err);
  });
});

/** DELETE /api/edit/:jobId — huỷ job (dừng FFmpeg ngay lập tức) */
router.delete("/:jobId", (req, res) => {
  const job = requireJob(req);
  const cancelled = jobs.cancel(job.id);
  res.json({ success: true, cancelled, job: jobs.snapshot(job) });
});

export default router;
