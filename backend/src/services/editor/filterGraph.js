import { buildSelectExpr } from "./timeline.js";
import { SFX_GAIN } from "./sfx.js";

/** Kích thước 4K theo chiều video: dọc → 2160x3840, ngang → 3840x2160 */
export function outputSize({ width, height }) {
  return height > width ? { width: 2160, height: 3840 } : { width: 3840, height: 2160 };
}

/**
 * Dựng filter_complex cho lượt render duy nhất:
 *   cắt khoảng lặng → scale 4K → vẽ phụ đề → chuẩn hoá âm lượng → trộn SFX
 *
 * @param {object} p
 * @param {Array}  p.segments       Đoạn giữ lại (từ buildKeepSegments)
 * @param {number} p.fps
 * @param {{width:number,height:number}} p.size  Kích thước đầu ra
 * @param {boolean} p.hasAudio
 * @param {string|null} p.assPath   Đường dẫn TƯƠNG ĐỐI tới file .ass (không chứa dấu ')
 * @param {string|null} p.fontsDir  Thư mục font (tương đối)
 * @param {Array}  p.sfxEvents      [{type, time}]
 * @param {Record<string, number>} p.sfxInputs  Chỉ số input của từng loại SFX, vd { whoosh: 1, pop: 2 }
 */
export function buildFilterGraph({ segments, fps, size, hasAudio, assPath, fontsDir, sfxEvents = [], sfxInputs = {} }) {
  const expr = buildSelectExpr(segments, fps);
  const { width: W, height: H } = size;
  const parts = [];

  // ---------- Hình ----------
  let video =
    `[0:v]fps=${fps},select='${expr}',setpts=N/FRAME_RATE/TB,` +
    `scale=${W}:${H}:force_original_aspect_ratio=decrease:flags=lanczos,` +
    `pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1`;
  if (assPath) {
    video += `,ass=filename='${assPath}'` + (fontsDir ? `:fontsdir='${fontsDir}'` : "");
  }
  video += `,format=yuv420p[v]`;
  parts.push(video);

  if (!hasAudio) return { filter: parts.join(";"), maps: ["v"] };

  // ---------- Tiếng ----------
  // asetnsamples = đúng 1 khung hình → aselect cắt tiếng khớp tuyệt đối với hình
  const samplesPerFrame = Math.round(48000 / fps);
  parts.push(
    `[0:a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,` +
      `asetnsamples=n=${samplesPerFrame}:p=0,aselect='${expr}',asetpts=N/SR/TB,` +
      `loudnorm=I=-14:TP=-1.5:LRA=11,aresample=48000[speech]`,
  );

  const mixInputs = ["[speech]"];
  for (const [type, inputIndex] of Object.entries(sfxInputs)) {
    const events = sfxEvents.filter((e) => e.type === type);
    if (!events.length) continue;

    const splitLabels = events.map((_, i) => `[${type}${i}]`).join("");
    parts.push(
      `[${inputIndex}:a]aformat=sample_rates=48000:sample_fmts=fltp:channel_layouts=stereo,` +
        `asplit=${events.length}${splitLabels}`,
    );
    events.forEach((e, i) => {
      const ms = Math.round(e.time * 1000);
      parts.push(`[${type}${i}]adelay=${ms}:all=1,volume=${SFX_GAIN[type] ?? 0.3}[${type}d${i}]`);
      mixInputs.push(`[${type}d${i}]`);
    });
  }

  // asetpts cuối cùng: ép timestamp liên tục → không bao giờ lệch tiếng sau các chỗ cắt
  if (mixInputs.length === 1) {
    parts.push(`[speech]asetpts=N/SR/TB[a]`);
  } else {
    parts.push(
      `${mixInputs.join("")}amix=inputs=${mixInputs.length}:duration=first:normalize=0:dropout_transition=0,` +
        `alimiter=limit=0.95,asetpts=N/SR/TB[a]`,
    );
  }

  return { filter: parts.join(";"), maps: ["v", "a"] };
}

/** Tuỳ chọn encoder H.264 (dùng chung cho render và nâng 4K) */
export function videoEncoderOptions({ encoder, fps, x264Preset, x264Crf, hwBitrate }) {
  const level = fps > 30 ? "5.2" : "5.1";
  let video;
  switch (encoder) {
    case "h264_videotoolbox": // Mac (Apple Silicon / Intel có T2): nhanh gấp nhiều lần
      video = ["-c:v", "h264_videotoolbox", "-b:v", hwBitrate, "-profile:v", "high", "-allow_sw", "1"];
      break;
    case "h264_nvenc": // Card NVIDIA
      video = ["-c:v", "h264_nvenc", "-preset", "p5", "-rc", "vbr", "-cq", "21", "-b:v", "0", "-profile:v", "high"];
      break;
    default:
      video = ["-c:v", "libx264", "-preset", x264Preset, "-crf", String(x264Crf), "-profile:v", "high", "-level:v", level];
  }
  return [...video, "-pix_fmt", "yuv420p", "-r", String(fps), "-tag:v", "avc1"];
}

/** Tuỳ chọn encoder H.264 + container MP4 */
export function buildOutputOptions(opts) {
  return [
    ...videoEncoderOptions(opts),
    "-c:a", "aac",
    "-b:a", "192k",
    "-ar", "48000",
    "-movflags", "+faststart",
    "-max_muxing_queue_size", "4096",
  ];
}
