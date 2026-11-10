/**
 * Chạy script Python của skill: đọc stdout từng dòng (để báo tiến trình),
 * huỷ được (kill cả nhóm tiến trình — gồm các FFmpeg con mà script mở ra).
 */
import { spawn } from "node:child_process";
import { chmodSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const abortError = () => new DOMException("Đã huỷ", "AbortError");

/**
 * Thư mục chứa lớp "ffmpeg tương thích" (scripts/ffmpeg-compat/ffmpeg): FFmpeg 8 đã bỏ
 * -filter_complex_script mà reel_engine.py dùng → lớp này đổi sang -/filter_complex.
 * Đặt lên đầu PATH khi chạy script của skill (Mac/Linux).
 */
const COMPAT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../scripts/ffmpeg-compat");
let compatReady = false;
function compatPath() {
  if (process.platform === "win32" || !existsSync(path.join(COMPAT_DIR, "ffmpeg"))) return null;
  if (!compatReady) {
    try {
      chmodSync(path.join(COMPAT_DIR, "ffmpeg"), 0o755); // giải nén/copy có thể làm mất quyền chạy
    } catch {
      /* không đổi được quyền → vẫn thử */
    }
    compatReady = true;
  }
  return COMPAT_DIR;
}

/**
 * @param {string} python   đường dẫn python
 * @param {string[]} args    [script, ...tham số]
 * @param {{cwd?:string, signal?:AbortSignal, onLine?:(line:string)=>void, label?:string, env?:object}} opts
 * @returns {Promise<string[]>}  các dòng output cuối (tối đa 400)
 */
export function runPython(python, args, { cwd, signal, onLine, label = "python", env = {} } = {}) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(abortError());

    const isWin = process.platform === "win32";
    const compat = compatPath();
    // ffmpeg-full (Homebrew, keg-only) không nằm trong PATH → thêm thư mục của nó để script Python gọi được cả ffprobe
    const ffDir = process.env.FFMPEG_PATH ? path.dirname(process.env.FFMPEG_PATH) : "";
    const PATH = [compat, ffDir, process.env.PATH ?? ""].filter(Boolean).join(path.delimiter);
    const child = spawn(python, args, {
      cwd,
      env: { ...process.env, PATH, PYTHONIOENCODING: "utf-8", PYTHONUNBUFFERED: "1", ...env },
      detached: !isWin, // tạo nhóm tiến trình riêng → kill được cả FFmpeg con
      stdio: ["ignore", "pipe", "pipe"],
    });

    const lines = [];
    const push = (line) => {
      lines.push(line);
      if (lines.length > 400) lines.shift();
      if (process.env.DEBUG_SKILL) console.log(`[${label}] ${line}`);
      onLine?.(line);
    };
    const reader = (stream) => {
      let buf = "";
      stream.setEncoding("utf8");
      stream.on("data", (chunk) => {
        buf += chunk;
        const parts = buf.split(/\r?\n|\r/);
        buf = parts.pop();
        parts.forEach((l) => l.trim() && push(l));
      });
      stream.on("end", () => buf.trim() && push(buf));
    };
    reader(child.stdout);
    reader(child.stderr);

    let settled = false;
    const done = (fn, v) => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener("abort", onAbort);
      fn(v);
    };
    const onAbort = () => {
      try {
        if (isWin) child.kill("SIGKILL");
        else process.kill(-child.pid, "SIGKILL");
      } catch {
        /* đã thoát */
      }
      done(reject, abortError());
    };
    signal?.addEventListener("abort", onAbort, { once: true });

    child.on("error", (err) => {
      const msg =
        err.code === "ENOENT"
          ? `Không tìm thấy Python (${python}). Hãy cài môi trường cho skill: npm run skill:setup`
          : err.message;
      done(reject, new Error(msg));
    });
    child.on("close", (code) => {
      if (signal?.aborted) return done(reject, abortError());
      if (code === 0) return done(resolve, lines);
      const tail = lines.slice(-12).join("\n");
      const e = new Error(`${label} lỗi (mã ${code}): ${lines.at(-1) ?? ""}`);
      e.log = tail;
      done(reject, e);
    });
  });
}
