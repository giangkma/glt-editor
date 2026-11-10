/**
 * Quản lý job Auto-Edit (bộ cơ bản FFmpeg hoặc skill như reel-doc-3d): hàng đợi (mặc định 1 job/lần vì render 4K rất nặng),
 * trạng thái, tiến trình, huỷ. Mỗi khi job thay đổi → phát sự kiện "update"
 * để route SSE đẩy về Frontend.
 *
 * Job lưu trong RAM: khởi động lại server là mất danh sách job (file đầu ra vẫn còn).
 */
import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";
import { config } from "../config.js";
import { runAutoEdit, STAGES } from "./editor/pipeline.js";
import { runSkillEdit, SKILL_STAGES, SKILL_STEPS } from "./skills/reelPipeline.js";
import { getSkill } from "./skills/registry.js";
import { AppError } from "../utils/AppError.js";
import { applyRevision } from "./skills/revise.js";
import { applyCover, coverFiles, readProjectCover, removeCover, renderCoverImage, saveProjectCover } from "./cover.js";

const BASIC_STEPS = [
  { stage: "analyzing", label: "Cắt khoảng lặng" },
  { stage: "transcribing", label: "Nhận diện giọng nói" },
  { stage: "preparing", label: "Text & SFX" },
  { stage: "rendering", label: "Render 4K" },
];

const TERMINAL = new Set(["done", "error", "cancelled"]);
export const isTerminal = (status) => TERMINAL.has(status);

class JobManager extends EventEmitter {
  constructor(concurrency) {
    super();
    this.setMaxListeners(0); // mỗi kết nối SSE là 1 listener
    this.concurrency = concurrency;
    this.jobs = new Map();
    this.queue = [];
    this.running = 0;
  }

  /**
   * @param {object} video   metadata video đã upload
   * @param {object} options { pipeline: "basic" | "skill", skillId?, mode?: "draft"|"final", projectId?, ... }
   */
  create(video, options = {}) {
    const id = randomUUID();
    const isSkill = options.pipeline === "skill";
    const job = {
      id,
      videoId: video.id,
      videoName:
        options.videos?.length > 1
          ? `${video.originalName} + ${options.videos.length - 1} clip`
          : video.originalName,
      clipCount: options.videos?.length ?? 1,
      pipeline: isSkill ? "skill" : "basic",
      skillId: isSkill ? options.skillId : null,
      mode: isSkill ? options.mode ?? "draft" : "final",
      steps: isSkill ? SKILL_STEPS : BASIC_STEPS,
      review: null,
      status: "queued",
      stage: "queued",
      progress: 0,
      message: "Đang chờ trong hàng đợi",
      warnings: [],
      stats: null,
      error: null,
      createdAt: new Date().toISOString(),
      finishedAt: null,
      // nội bộ — không gửi ra ngoài
      _video: video,
      _options: isSkill ? { ...options, projectId: options.projectId ?? id } : options,
      _controller: new AbortController(),
      _outputPath: null,
      /** Ảnh bìa: null | { status: working|done|error, progress, time, insert, hasVideo, pendingFinal, error, version } */
      cover: null,
    };
    this.jobs.set(job.id, job);
    this.queue.push(job.id);
    this.#emit(job);
    this.#next();
    return this.snapshot(job);
  }

  get(id) {
    return this.jobs.get(id) ?? null;
  }

  /** Dữ liệu an toàn để gửi về client */
  snapshot(job) {
    const { _video, _options, _controller, _outputPath, ...pub } = job;
    return {
      ...pub,
      export4k: Boolean(_options.export4k),
      cover: job.cover ? { ...job.cover } : null,
      fps60: Boolean(_options.export4k && _options.fps60),
      warnings: [...job.warnings],
      queuePosition: this.queue.indexOf(job.id) + 1 || 0,
    };
  }

  /** Bản nháp (skill) đã duyệt → tạo job dựng bản chính, dùng lại kịch bản + thư mục dự án */
  finalize(id, { export4k, fps60 } = {}) {
    const draft = this.jobs.get(id);
    if (!draft) throw new AppError("Không tìm thấy job.", 404, "JOB_NOT_FOUND");
    if (draft.pipeline !== "skill" || draft.mode !== "draft" || draft.status !== "done") {
      throw new AppError("Chỉ duyệt được bản nháp (skill) đã dựng xong.", 409, "NOT_A_FINISHED_DRAFT");
    }
    return this.create(draft._video, {
      ...draft._options,
      mode: "final",
      export4k: export4k ?? draft._options.export4k,
      fps60: (export4k ?? draft._options.export4k) && (fps60 ?? draft._options.fps60),
      projectId: draft._options.projectId,
    });
  }

  /**
   * Đặt / làm lại ảnh bìa cho job đã xong.
   * Bản nháp skill: chỉ dựng ảnh bìa xem trước + lưu vào dự án → bản chính tự chèn khi duyệt.
   * Bản chính / bộ cơ bản: ảnh bìa + (tuỳ chọn) video có bìa ở đầu.
   */
  setCover(id, { overlayPath, time, insert }) {
    const job = this.jobs.get(id);
    if (!job) throw new AppError("Không tìm thấy job.", 404, "JOB_NOT_FOUND");
    if (job.status !== "done" || !job._outputPath) throw new AppError("Video chưa dựng xong.", 409, "NOT_READY");
    job._coverCtrl?.abort();
    const ctrl = new AbortController();
    job._coverCtrl = ctrl;
    const version = (job.cover?.version ?? 0) + 1;
    const isDraft = job.pipeline === "skill" && job.mode === "draft";
    job.cover = { status: "working", progress: 0, time, insert, hasVideo: false, pendingFinal: isDraft, error: null, version };
    this.#emit(job);

    (async () => {
      const files = coverFiles(job.id);
      try {
        if (isDraft) {
          await saveProjectCover(job._options.projectId, overlayPath, { time, insert });
          await renderCoverImage(job._outputPath, overlayPath, time, files.image, { signal: ctrl.signal });
        } else {
          await applyCover({
            jobId: job.id,
            videoPath: job._outputPath,
            overlayPath,
            time,
            insert,
            signal: ctrl.signal,
            onProgress: (f) => {
              const pct = Math.floor(f * 100);
              if (job.cover?.version === version && pct !== job.cover.progress) {
                job.cover.progress = pct;
                this.#emit(job);
              }
            },
          });
        }
        if (job.cover?.version !== version) return;
        job.cover = { ...job.cover, status: "done", progress: 100, hasVideo: !isDraft && insert > 0 };
      } catch (err) {
        if (ctrl.signal.aborted || job.cover?.version !== version) return;
        console.error(`[job ${job.id.slice(0, 8)}] ảnh bìa lỗi:`, err.message);
        job.cover = { ...job.cover, status: "error", error: err.message };
      } finally {
        await import("node:fs/promises").then((m) => m.rm(overlayPath, { force: true })).catch(() => {});
      }
      this.#emit(job);
    })();
    return this.snapshot(job);
  }

  /** Chỉnh nhanh bản nháp (sửa chữ / bỏ cảnh / đổi nhạc) → job nháp mới dùng chung dự án, không gọi lại AI */
  async revise(id, edits) {
    const draft = this.jobs.get(id);
    if (!draft) throw new AppError("Không tìm thấy job.", 404, "JOB_NOT_FOUND");
    if (draft.pipeline !== "skill" || draft.mode !== "draft" || draft.status !== "done") {
      throw new AppError("Chỉ chỉnh nhanh được bản nháp (skill) đã dựng xong.", 409, "NOT_A_FINISHED_DRAFT");
    }
    if (this.queue.length || this.running) {
      // dự án đang được dựng ở job khác → tránh ghi đè file đang dùng
      const busy = [...this.jobs.values()].some((j) => !isTerminal(j.status) && j._options.projectId === draft._options.projectId);
      if (busy) throw new AppError("Dự án này đang được dựng, đợi xong rồi chỉnh.", 409, "PROJECT_BUSY");
    }
    const changes = await applyRevision(draft, edits);
    const job = this.create(draft._video, { ...draft._options, mode: "draft", revised: true, projectId: draft._options.projectId });
    const j = this.jobs.get(job.id);
    j.warnings.push(`Chỉnh nhanh: ${changes.join(", ")}`);
    return this.snapshot(j);
  }

  async clearCover(id) {
    const job = this.jobs.get(id);
    if (!job) throw new AppError("Không tìm thấy job.", 404, "JOB_NOT_FOUND");
    job._coverCtrl?.abort();
    await removeCover(job.id, job.pipeline === "skill" && job.mode === "draft" ? job._options.projectId : null);
    job.cover = null;
    this.#emit(job);
    return this.snapshot(job);
  }

  cancel(id) {
    const job = this.jobs.get(id);
    if (!job || isTerminal(job.status)) return false;
    this.queue = this.queue.filter((q) => q !== id);
    job._controller.abort();
    // Job đang chờ chưa chạy → chốt trạng thái luôn
    if (job.status === "queued") this.#finish(job, { status: "cancelled", message: "Đã huỷ" });
    return true;
  }

  #update(job, patch) {
    Object.assign(job, patch);
    this.#emit(job);
  }

  #emit(job) {
    this.emit("update", this.snapshot(job));
  }

  #finish(job, patch) {
    this.#update(job, { ...patch, finishedAt: new Date().toISOString() });
    // Giữ job trong RAM 6 tiếng để client còn tải file / xem kết quả
    setTimeout(() => this.jobs.delete(job.id), 6 * 60 * 60 * 1000).unref();
  }

  #next() {
    while (this.running < this.concurrency && this.queue.length) {
      const job = this.jobs.get(this.queue.shift());
      if (!job || isTerminal(job.status)) continue;
      this.running++;
      this.#run(job).finally(() => {
        this.running--;
        // Cập nhật vị trí hàng đợi cho các job đang chờ
        for (const id of this.queue) this.#emit(this.jobs.get(id));
        this.#next();
      });
    }
  }

  async #run(job) {
    this.#update(job, {
      status: "processing",
      stage: job.pipeline === "skill" ? "transcribing" : "analyzing",
      message: "Bắt đầu xử lý",
    });

    let lastSent = { pct: -1, stage: "", time: 0 };
    const stages = job.pipeline === "skill" ? SKILL_STAGES : STAGES;
    const report = (stage, fraction, message) => {
      const [from, to] = stages[stage] ?? [0, 100];
      const progress = Math.floor(from + (to - from) * Math.min(1, Math.max(0, fraction)));
      job.stage = stage;
      job.progress = Math.max(job.progress, progress); // không bao giờ lùi
      if (message) job.message = message;
      // Giới hạn tần suất: chỉ gửi khi % đổi / đổi giai đoạn / quá 2 giây
      const now = Date.now();
      if (job.progress !== lastSent.pct || stage !== lastSent.stage || now - lastSent.time > 2000) {
        lastSent = { pct: job.progress, stage, time: now };
        this.#emit(job);
      }
    };
    const warn = (msg) => {
      console.warn(`[job ${job.id.slice(0, 8)}] ${msg}`);
      job.warnings.push(msg);
      this.#emit(job);
    };

    const startedAt = Date.now();
    try {
      const common = { jobId: job.id, video: job._video, options: job._options, report, warn, signal: job._controller.signal };
      let result;
      if (job.pipeline === "skill") {
        const skill = await getSkill(job.skillId); // đọc lại: trạng thái cài đặt có thể vừa thay đổi
        if (!skill) throw new Error(`Không tìm thấy skill "${job.skillId}".`);
        result = await runSkillEdit({ ...common, skill });
      } else {
        result = await runAutoEdit(common);
      }
      const { outputPath, stats, review = null } = result;
      job._outputPath = outputPath;
      job.review = review;

      // Bản chính skill: bản nháp đã chọn ảnh bìa → chèn luôn
      if (job.pipeline === "skill" && job.mode === "final") {
        const pc = await readProjectCover(job._options.projectId);
        if (pc) {
          report("upscaling", 1, "Chèn ảnh bìa");
          try {
            await applyCover({ jobId: job.id, videoPath: outputPath, overlayPath: pc.overlayPath, time: pc.time, insert: pc.insert, signal: job._controller.signal });
            job.cover = { status: "done", progress: 100, time: pc.time, insert: pc.insert, hasVideo: pc.insert > 0, pendingFinal: false, error: null, version: 1 };
          } catch (err) {
            if (job._controller.signal.aborted) throw err;
            warn(`Không chèn được ảnh bìa: ${err.message}`);
          }
        }
      }
      this.#finish(job, {
        status: "done",
        stage: "done",
        progress: 100,
        message: "Hoàn tất",
        stats: { ...stats, processingSeconds: Math.round((Date.now() - startedAt) / 1000) },
      });
      console.log(`[job ${job.id.slice(0, 8)}] xong sau ${Math.round((Date.now() - startedAt) / 1000)}s`);
    } catch (err) {
      if (job._controller.signal.aborted) {
        this.#finish(job, { status: "cancelled", message: "Đã huỷ" });
        return;
      }
      console.error(`[job ${job.id.slice(0, 8)}] lỗi:`, err.message, err.ffmpegLog ?? err.log ?? "");
      this.#finish(job, { status: "error", message: "Xử lý thất bại", error: err.message });
    }
  }

  /** Huỷ tất cả khi tắt server → không để lại tiến trình FFmpeg mồ côi */
  abortAll() {
    for (const job of this.jobs.values()) if (!isTerminal(job.status)) job._controller.abort();
  }
}

export const jobs = new JobManager(config.edit.concurrency);
