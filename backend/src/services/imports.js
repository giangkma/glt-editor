/**
 * Phiên "nhập video từ Google Drive": liệt kê thư mục → tải từng file (lần lượt) → kiểm tra là video
 * → lưu vào uploads/ y như video tải lên thường (cùng định dạng metadata) → frontend thêm vào danh sách clip.
 * Tiến trình đẩy về qua SSE giống job edit.
 */
import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";
import path from "node:path";
import fs from "node:fs/promises";
import { config } from "../config.js";
import { parseDriveLinks, listFolder, downloadFile, driveExt } from "./drive.js";
import { saveMeta, safeUnlink } from "./videoStore.js";
import { probe } from "./editor/ffmpeg.js";
import { AppError } from "../utils/AppError.js";

const MAX_FILES = 30;
export const isImportDone = (s) => s === "done" || s === "error" || s === "cancelled";

class ImportManager extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(0);
    this.sessions = new Map();
  }

  create(text) {
    const { items, bad } = parseDriveLinks(text);
    if (!items.length) {
      throw new AppError(
        bad.length ? "Không nhận ra link Google Drive (cần dạng drive.google.com/file/d/… hoặc …/folders/…)." : "Chưa có link nào.",
        400,
        "INVALID_LINK",
      );
    }
    const s = {
      id: randomUUID(),
      status: "running",
      message: "Đang đọc link…",
      sources: items,
      ignored: bad,
      files: [], // { key, driveId, name, status: waiting|downloading|done|error, percent, loaded, total, error, video }
      _ctrl: new AbortController(),
    };
    this.sessions.set(s.id, s);
    this.#run(s).finally(() => setTimeout(() => this.sessions.delete(s.id), 60 * 60 * 1000).unref());
    return this.snapshot(s);
  }

  get(id) {
    return this.sessions.get(id) ?? null;
  }

  snapshot(s) {
    const { _ctrl, sources, ...pub } = s;
    return {
      ...pub,
      files: s.files.map(({ driveId, ...f }) => f),
      videos: s.files.filter((f) => f.status === "done").map((f) => f.video),
    };
  }

  cancel(id) {
    const s = this.sessions.get(id);
    if (!s || isImportDone(s.status)) return false;
    s._ctrl.abort();
    return true;
  }

  #emit(s) {
    this.emit("update", this.snapshot(s));
  }

  async #run(s) {
    const signal = s._ctrl.signal;
    try {
      // 1. Link thư mục → danh sách video bên trong (giữ đúng thứ tự link người dùng dán)
      for (const src of s.sources) {
        if (src.type === "file") {
          s.files.push({ key: `f${s.files.length}`, driveId: src.id, name: "File Drive", status: "waiting", percent: 0, loaded: 0, total: 0, error: null, video: null });
          continue;
        }
        s.message = "Đang đọc thư mục Drive…";
        this.#emit(s);
        try {
          const list = await listFolder(src.id, { signal });
          if (!list.length) throw new Error("Thư mục không có video nào (hoặc chưa chia sẻ công khai).");
          for (const f of list) {
            s.files.push({ key: `f${s.files.length}`, driveId: f.id, name: f.name, status: "waiting", percent: 0, loaded: 0, total: f.size, error: null, video: null });
          }
        } catch (err) {
          if (signal.aborted) throw err;
          s.files.push({ key: `f${s.files.length}`, driveId: null, name: "Thư mục Drive", status: "error", percent: 0, loaded: 0, total: 0, error: err.message, video: null });
        }
      }
      if (s.files.length > MAX_FILES) {
        s.files.slice(MAX_FILES).forEach((f) => Object.assign(f, { status: "error", error: `Quá ${MAX_FILES} video/lần — bỏ qua.` }));
      }

      // 2. Tải lần lượt
      for (const f of s.files) {
        if (f.status !== "waiting") continue;
        f.status = "downloading";
        s.message = `Đang tải ${s.files.indexOf(f) + 1}/${s.files.length}`;
        this.#emit(s);
        const id = randomUUID();
        let dest = path.join(config.uploadDir, `${id}.dl`);
        try {
          let lastEmit = 0;
          const meta = await downloadFile(f.driveId, dest, {
            signal,
            onProgress: ({ loaded, total, percent }) => {
              Object.assign(f, { loaded, total: total || f.total, percent: percent >= 0 ? percent : f.percent });
              if (Date.now() - lastEmit > 400) {
                lastEmit = Date.now();
                this.#emit(s);
              }
            },
          });
          const name = meta.name || f.name;
          const finalPath = path.join(config.uploadDir, `${id}${driveExt(name)}`);
          await fs.rename(dest, finalPath);
          dest = finalPath;

          // Phải là video thật (thư mục có thể lẫn ảnh, tài liệu…)
          const info = await probe(finalPath).catch(() => null);
          if (!info || !info.duration) throw new Error("Không phải file video.");

          await saveMeta({
            id,
            filename: path.basename(finalPath),
            originalName: name,
            mimeType: meta.mimeType,
            size: meta.size,
            path: finalPath,
            status: "uploaded",
            source: `drive:${f.driveId}`,
            createdAt: new Date().toISOString(),
          });
          Object.assign(f, { status: "done", name, percent: 100, video: { id, originalName: name, size: meta.size } });
        } catch (err) {
          await safeUnlink(dest);
          if (signal.aborted) throw err;
          Object.assign(f, { status: "error", error: err.message });
        }
        this.#emit(s);
      }

      const ok = s.files.filter((f) => f.status === "done").length;
      s.status = ok ? "done" : "error";
      s.message = ok ? `Đã tải ${ok}/${s.files.length} video từ Drive` : "Không tải được video nào từ Drive.";
    } catch (err) {
      s.status = signal.aborted ? "cancelled" : "error";
      s.message = signal.aborted ? "Đã huỷ" : err.message;
    }
    this.#emit(s);
  }
}

export const imports = new ImportManager();
