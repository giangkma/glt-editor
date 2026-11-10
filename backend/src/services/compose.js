/**
 * GHÉP CHỮ + HIỆU ỨNG lên video nền bằng ĐÚNG bộ vẽ của trình duyệt (frontend/src/lib/overlay/render.js)
 * chạy trên @napi-rs/canvas → bản xuất giống hệt bản xem trước trong Studio.
 * Khung RGBA đẩy qua ống (pipe) vào FFmpeg, chồng lên video nền. Khung không có hiệu ứng → gửi khung trong suốt (rất nhanh).
 */
import { spawn } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { config } from "../config.js";
import { probe } from "./editor/ffmpeg.js";
import { videoEncoderOptions } from "./editor/filterGraph.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const RENDERER_PATH = process.env.OVERLAY_RENDERER ?? path.resolve(HERE, "../../../frontend/src/lib/overlay/render.js");

let canvasMod;
/** @napi-rs/canvas có cài chưa (không có → engine tự vẽ chữ kiểu cũ) */
export async function loadCanvas() {
  if (canvasMod !== undefined) return canvasMod;
  try {
    canvasMod = await import("@napi-rs/canvas");
    canvasMod = canvasMod.default ?? canvasMod;
  } catch {
    canvasMod = null;
  }
  return canvasMod;
}
export const canCompose = async () => Boolean((await loadCanvas()) && existsSync(RENDERER_PATH));

let fontsDone = false;
/** Font của skill → tên họ font dùng trong render.js */
export const FONT_FILES = [
  ["Phudu-VF.ttf", "Phudu"],
  ["InterTight-VF.ttf", "Inter Tight"],
  ["PlayfairDisplay-Italic-VF.ttf", "Playfair Display"],
];
/** Bản cố định từng độ đậm (backend/assets/fonts: Phudu-800.ttf → "Phudu 800") — canvas phía server
 *  không chọn được độ đậm của font biến thiên, nên mỗi độ đậm là 1 tên họ riêng, khớp với fontCss() của render.js */
const STATIC_DIR = path.resolve(HERE, "../../assets/fonts");
const STATIC_FAMILY = { Phudu: "Phudu", InterTight: "Inter Tight", "PlayfairDisplay-Italic": "Playfair Display" };
function registerFonts(C, fontsDir) {
  if (fontsDone) return;
  for (const [file, family] of FONT_FILES) {
    const p = path.join(fontsDir, file);
    if (existsSync(p)) C.GlobalFonts.registerFromPath(p, family);
  }
  if (existsSync(STATIC_DIR)) {
    for (const f of readdirSync(STATIC_DIR)) {
      const m = f.match(/^(.+)-(\d{3})\.ttf$/);
      if (m && STATIC_FAMILY[m[1]]) C.GlobalFonts.registerFromPath(path.join(STATIC_DIR, f), `${STATIC_FAMILY[m[1]]} ${m[2]}`);
    }
  }
  fontsDone = true;
}

/** "asset:<tên file>" → đường dẫn trong thư mục dự án */
export const assetPath = (proj, src) => path.join(proj, "assets", String(src).replace(/^asset:/, ""));

/**
 * @param {{input:string, output:string, timeline:object, proj:string, fontsDir:string, signal?:AbortSignal, onProgress?:(f:number)=>void}} p
 */
export async function composeVideo({ input, output, timeline, proj, fontsDir, signal, onProgress }) {
  const C = await loadCanvas();
  if (!C) throw new Error("Thiếu thư viện @napi-rs/canvas — chạy npm install trong thư mục backend.");
  registerFonts(C, fontsDir);
  const R = await import(pathToFileURL(RENDERER_PATH).href);

  const info = await probe(input);
  const W = info.width;
  const H = info.height;
  const fps = Math.round(info.fps || 30);
  const N = Math.max(1, Math.round((info.videoDuration || info.duration) * fps));

  // Ảnh minh hoạ
  const images = new Map();
  for (const it of timeline.items ?? []) {
    if (it.type === "image" && it.src && !images.has(it.src)) {
      const p = assetPath(proj, it.src);
      if (existsSync(p)) images.set(it.src, await C.loadImage(p).catch(() => null));
    }
  }

  const canvas = C.createCanvas(W, H);
  const ctx = canvas.getContext("2d");
  const empty = Buffer.alloc(W * H * 4);
  const ranges = R.activeRanges(timeline);
  const inRange = (t) => ranges.some(([a, b]) => t >= a && t <= b);

  const bin = process.env.FFMPEG_PATH || "ffmpeg";
  const args = [
    "-y", "-v", "error",
    "-i", input,
    "-f", "rawvideo", "-pix_fmt", "rgba", "-s", `${W}x${H}`, "-r", String(fps), "-i", "pipe:0",
    "-filter_complex", "[0:v][1:v]overlay=0:0:format=auto:eof_action=pass,format=yuv420p[v]",
    "-map", "[v]", "-map", "0:a?",
    ...videoEncoderOptions({ ...config.edit, encoder: config.edit.videoEncoder, fps }),
    "-c:a", "copy", "-movflags", "+faststart",
    output,
  ];
  const ff = spawn(bin, args, { stdio: ["pipe", "ignore", "pipe"] });
  let errLog = "";
  ff.stderr.on("data", (d) => (errLog = (errLog + d).slice(-4000)));
  const done = new Promise((resolve, reject) => {
    ff.on("error", reject);
    ff.on("close", (code) => (code === 0 ? resolve() : reject(Object.assign(new Error(`Ghép chữ thất bại (ffmpeg ${code})`), { ffmpegLog: errLog }))));
  });
  const onAbort = () => ff.kill("SIGKILL");
  signal?.addEventListener("abort", onAbort);
  ff.stdin.on("error", () => {}); // ffmpeg dừng sớm → lỗi sẽ báo qua "close"

  const write = (buf) => (ff.stdin.write(buf) ? null : new Promise((r) => ff.stdin.once("drain", r)));
  try {
    let lastPct = -1;
    for (let i = 0; i < N; i++) {
      if (signal?.aborted) throw Object.assign(new Error("Đã huỷ"), { name: "AbortError" });
      const t = i / fps;
      let buf = empty;
      if (inRange(t)) {
        ctx.clearRect(0, 0, W, H);
        R.drawFrame(ctx, timeline, t, W, H, { images });
        const d = ctx.getImageData(0, 0, W, H).data;
        buf = Buffer.from(d.buffer, d.byteOffset, d.byteLength);
      }
      const w = write(buf);
      if (w) await w;
      const pct = Math.floor((i / N) * 100);
      if (pct !== lastPct) {
        lastPct = pct;
        onProgress?.(i / N);
      }
    }
    ff.stdin.end();
    await done;
  } finally {
    signal?.removeEventListener("abort", onAbort);
    if (!ff.killed && ff.exitCode === null) ff.stdin.end();
  }
  return { width: W, height: H, frames: N };
}

/** Timeline có gì để vẽ không */
export const hasVisibleItems = (tl) => (tl?.items ?? []).some((it) => !it.hidden && (it.type !== "caption" || tl.style?.captions !== false));
