/**
 * Lớp bọc fluent-ffmpeg: mọi lệnh gọi FFmpeg nằm ở đây.
 * Cần cài FFmpeg trên máy:  brew install ffmpeg   (Mac)
 * Hoặc chỉ định đường dẫn qua biến môi trường FFMPEG_PATH / FFPROBE_PATH.
 */
import ffmpeg from "fluent-ffmpeg";
import { existsSync } from "node:fs";
import { execFile } from "node:child_process";
import { parseSilenceLog } from "./timeline.js";

/**
 * Homebrew đã thu gọn gói "ffmpeg" (bỏ libass → không vẽ được phụ đề...) và tách bản đủ tính năng
 * ra "ffmpeg-full" (keg-only: không ghi đè lệnh ffmpeg). Chưa đặt FFMPEG_PATH mà máy có ffmpeg-full
 * → tự dùng nó. Ghi vào process.env để script Python của skill cũng dùng cùng bản.
 */
if (!process.env.FFMPEG_PATH) {
  const kegs = ["/opt/homebrew/opt/ffmpeg-full/bin", "/usr/local/opt/ffmpeg-full/bin"];
  const keg = kegs.find((d) => existsSync(`${d}/ffmpeg`));
  if (keg) {
    process.env.FFMPEG_PATH = `${keg}/ffmpeg`;
    process.env.FFPROBE_PATH ??= `${keg}/ffprobe`;
  }
}
export const ffmpegPath = process.env.FFMPEG_PATH ?? "ffmpeg (PATH)";

if (process.env.FFMPEG_PATH) ffmpeg.setFfmpegPath(process.env.FFMPEG_PATH);
if (process.env.FFPROBE_PATH) ffmpeg.setFfprobePath(process.env.FFPROBE_PATH);

export { ffmpeg };

/** "01:02:03.45" → 3723.45 */
export function timemarkToSeconds(mark) {
  if (!mark || typeof mark !== "string") return 0;
  const neg = mark.startsWith("-");
  const parts = mark.replace("-", "").split(":").map(Number);
  const sec = parts.reduce((acc, v) => acc * 60 + (Number.isFinite(v) ? v : 0), 0);
  return neg ? 0 : sec;
}

const abortError = () => new DOMException("Đã huỷ", "AbortError");

/**
 * Chạy 1 lệnh fluent-ffmpeg dưới dạng Promise.
 * - Báo tiến trình (0..1) dựa trên timemark / thời lượng đầu ra dự kiến
 * - Huỷ được qua AbortSignal (kill tiến trình FFmpeg)
 * - Khi lỗi, đính kèm vài dòng cuối của stderr để dễ debug
 */
export function runCommand(command, { signal, expectedDuration = 0, onProgress, onStderr, label = "ffmpeg" } = {}) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(abortError());

    const tail = [];
    let settled = false;
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener("abort", onAbort);
      fn(value);
    };
    const onAbort = () => {
      try {
        command.kill("SIGKILL");
      } catch {
        /* tiến trình có thể đã thoát */
      }
      finish(reject, abortError());
    };
    signal?.addEventListener("abort", onAbort, { once: true });

    command
      .on("start", (cmdLine) => {
        if (process.env.DEBUG_FFMPEG) console.log(`[${label}] ${cmdLine}`);
      })
      .on("stderr", (line) => {
        tail.push(line);
        if (tail.length > 40) tail.shift();
        onStderr?.(line);
      })
      .on("progress", (p) => {
        if (!onProgress || !expectedDuration) return;
        const done = timemarkToSeconds(p.timemark);
        onProgress(Math.min(1, Math.max(0, done / expectedDuration)));
      })
      .on("error", (err) => {
        if (signal?.aborted) return finish(reject, abortError());
        const detail = tail.filter((l) => !/^\s*(frame|size)=/.test(l)).slice(-8).join("\n");
        const e = new Error(`${label} thất bại: ${err.message}`);
        e.ffmpegLog = detail;
        finish(reject, e);
      })
      .on("end", () => finish(resolve));

    command.run();
  });
}

/**
 * Đọc thông tin video bằng ffprobe (gọi trực tiếp, xuất JSON).
 * KHÔNG dùng ffmpeg.ffprobe() của fluent-ffmpeg: bộ đọc của nó làm rơi mất "side_data" →
 * mất cờ xoay của video quay dọc trên iPhone (lưu khung ngang + rotation=-90) → tưởng là video ngang.
 */
export function probe(file) {
  const bin = process.env.FFPROBE_PATH || "ffprobe";
  return new Promise((resolve, reject) => {
    execFile(
      bin,
      ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", file],
      { maxBuffer: 16 * 1024 * 1024 },
      (err, stdout) => {
        if (err) return reject(new Error(`Không đọc được file video: ${err.message}`));
        let data;
        try {
          data = JSON.parse(stdout);
        } catch {
          return reject(new Error("ffprobe trả về dữ liệu không đọc được."));
        }

        const streams = data.streams ?? [];
        const v = streams.find((s) => s.codec_type === "video" && s.disposition?.attached_pic !== 1);
        const a = streams.find((s) => s.codec_type === "audio");
        if (!v) return reject(new Error("File không có luồng hình (video stream)."));

        // Cờ xoay: side_data "Display Matrix" (FFmpeg mới) hoặc tag "rotate" (FFmpeg cũ)
        const sd = (v.side_data_list ?? []).find((d) => d.rotation !== undefined);
        const rotation = Number(sd?.rotation ?? v.tags?.rotate ?? 0) || 0;
        const rotated = Math.abs(Math.round(rotation)) % 180 === 90;

        const parseRate = (r) => {
          const [n, d] = String(r ?? "0/1").split("/").map(Number);
          return d ? n / d : n;
        };

        resolve({
          duration: Number(data.format?.duration) || Number(v.duration) || 0,
          /** thời lượng luồng hình (có thể ngắn hơn tiếng vài phần giây) */
          videoDuration: Number(v.duration) || Number(data.format?.duration) || 0,
          width: rotated ? v.height : v.width,
          height: rotated ? v.width : v.height,
          rotation,
          fps: parseRate(v.avg_frame_rate) || parseRate(v.r_frame_rate) || 30,
          hasAudio: Boolean(a),
        });
      },
    );
  });
}

/** Tìm khoảng lặng bằng filter silencedetect */
export async function detectSilence(file, { thresholdDb, minSilenceSec, duration, signal, onProgress }) {
  const lines = [];
  const cmd = ffmpeg(file)
    .noVideo()
    .audioFilters(`silencedetect=noise=${thresholdDb}dB:d=${minSilenceSec}`)
    .format("null")
    .output("-");

  await runCommand(cmd, {
    signal,
    expectedDuration: duration,
    onProgress,
    onStderr: (line) => line.includes("silence_") && lines.push(line),
    label: "silencedetect",
  });
  return parseSilenceLog(lines, duration);
}

/** Tách tiếng (mono 16kHz mp3) để gửi đi nhận diện giọng nói — nhỏ gọn, ~22MB/giờ */
export function extractSpeechAudio(file, outPath, { duration, signal, onProgress }) {
  const cmd = ffmpeg(file)
    .noVideo()
    .audioChannels(1)
    .audioFrequency(16000)
    .audioCodec("libmp3lame")
    .audioBitrate("48k")
    .output(outPath);
  return runCommand(cmd, { signal, expectedDuration: duration, onProgress, label: "extract-audio" });
}

/** Kiểm tra FFmpeg có các filter / encoder cần thiết không */
let capsPromise;
export function getCapabilities() {
  capsPromise ??= Promise.all([
    new Promise((res, rej) => ffmpeg.getAvailableFilters((e, f) => (e ? rej(e) : res(f)))),
    new Promise((res, rej) => ffmpeg.getAvailableEncoders((e, f) => (e ? rej(e) : res(f)))),
  ]).then(([filters, encoders]) => ({
    ass: Boolean(filters.ass),
    silencedetect: Boolean(filters.silencedetect),
    loudnorm: Boolean(filters.loudnorm),
    encoders: new Set(Object.keys(encoders)),
    filters: new Set(Object.keys(filters)),
  }));
  capsPromise.catch(() => {
    capsPromise = undefined; // cho phép thử lại lần sau
  });
  return capsPromise;
}
