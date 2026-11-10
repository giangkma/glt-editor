/**
 * Chuỗi Auto-Edit:
 *   1. Phân tích   — ffprobe + silencedetect → các đoạn có tiếng nói
 *   2. Nhận diện   — Whisper → timestamp từng chữ (nếu có OPENAI_API_KEY)
 *   3. Chuẩn bị    — tạo phụ đề .ass + lên lịch sound effect
 *   4. Render      — 1 lượt FFmpeg duy nhất: cắt + 4K + phụ đề + SFX → MP4 H.264
 */
import fs from "node:fs/promises";
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { config } from "../../config.js";
import { probe, detectSilence, extractSpeechAudio, getCapabilities, runCommand, ffmpeg } from "./ffmpeg.js";
import { buildKeepSegments, totalDuration, remapWords, pickFps } from "./timeline.js";
import { chunkWords, buildAss } from "./captions.js";
import { planSfx, SFX_NAMES, sfxWav } from "./sfx.js";
import { buildFilterGraph, buildOutputOptions, outputSize } from "./filterGraph.js";
import { transcribeWords, transcriptionEnabled } from "./transcribe.js";

/** Mỗi giai đoạn chiếm 1 khoảng % trên thanh tiến trình tổng */
export const STAGES = {
  analyzing: [0, 8],
  transcribing: [8, 20],
  preparing: [20, 23],
  rendering: [23, 99],
};

const sfxDir = () => path.join(config.assetsDir, "sfx");
const fontsDir = () => path.join(config.assetsDir, "fonts");

/** Tạo file SFX nếu chưa có (người dùng có thể thay bằng file của mình) */
export async function ensureSfxFiles() {
  await fs.mkdir(sfxDir(), { recursive: true });
  const files = {};
  for (const name of SFX_NAMES) {
    const file = path.join(sfxDir(), `${name}.wav`);
    if (!existsSync(file)) await fs.writeFile(file, sfxWav(name));
    files[name] = file;
  }
  return files;
}

/**
 * @param {object} p
 * @param {string} p.jobId
 * @param {{path:string, originalName:string}} p.video
 * @param {{captions?:boolean, sfx?:boolean, silenceThresholdDb?:number, minSilenceSec?:number}} p.options
 * @param {(stage:string, fraction:number, message?:string) => void} p.report
 * @param {(msg:string) => void} p.warn
 * @param {AbortSignal} p.signal
 */
export async function runAutoEdit({ jobId, video, options = {}, report, warn, signal }) {
  const cfg = config.edit;
  const workDir = path.join(config.tmpDir, jobId);
  const partPath = path.join(config.outputDir, `${jobId}.part.mp4`);
  const finalPath = path.join(config.outputDir, `${jobId}.mp4`);
  await fs.mkdir(workDir, { recursive: true });
  await fs.mkdir(config.outputDir, { recursive: true });

  try {
    // ───────── 1. Phân tích ─────────
    report("analyzing", 0, "Đọc thông tin video");
    const [info, caps] = await Promise.all([probe(video.path), getCapabilities()]);
    if (!info.duration) throw new Error("Không xác định được thời lượng video.");

    const fps = pickFps(info.fps);
    const size = outputSize(info);

    let segments = [{ start: 0, end: Math.floor(info.duration * fps) / fps, outStart: 0 }];
    if (info.hasAudio) {
      report("analyzing", 0.05, "Tìm khoảng lặng");
      const silences = await detectSilence(video.path, {
        thresholdDb: options.silenceThresholdDb ?? cfg.silenceThresholdDb,
        minSilenceSec: options.minSilenceSec ?? cfg.minSilenceSec,
        duration: info.duration,
        signal,
        onProgress: (f) => report("analyzing", 0.05 + f * 0.95, "Tìm khoảng lặng"),
      });
      segments = buildKeepSegments(silences, info.duration, { fps, paddingSec: cfg.paddingSec });
    } else {
      warn("Video không có âm thanh → không cắt khoảng lặng, không chèn text/SFX.");
    }
    const outDuration = totalDuration(segments);

    // ───────── 2. Nhận diện giọng nói ─────────
    let captions = [];
    const wantCaptions = options.captions !== false && info.hasAudio;
    if (wantCaptions && !caps.ass) {
      warn("FFmpeg trên máy thiếu libass → không chèn được text. Cài bản đầy đủ: brew install ffmpeg-full (web tự nhận, khởi động lại backend)");
    } else if (wantCaptions && !transcriptionEnabled()) {
      warn("Chưa có OPENAI_API_KEY → bỏ qua bước chèn text theo giọng nói.");
    } else if (wantCaptions) {
      try {
        report("transcribing", 0, "Tách âm thanh");
        const audioPath = path.join(workDir, "speech.mp3");
        await extractSpeechAudio(video.path, audioPath, {
          duration: info.duration,
          signal,
          onProgress: (f) => report("transcribing", f * 0.3, "Tách âm thanh"),
        });
        report("transcribing", 0.35, "Nhận diện giọng nói (Whisper)");
        const words = await transcribeWords(audioPath, { signal });
        captions = chunkWords(remapWords(words, segments));
        report("transcribing", 1, `Nhận diện được ${words.length} chữ`);
      } catch (err) {
        if (signal.aborted) throw err;
        warn(`Không chèn được text: ${err.message}`);
      }
    }

    // ───────── 3. Chuẩn bị phụ đề + SFX ─────────
    report("preparing", 0, "Chuẩn bị phụ đề & hiệu ứng");
    let assRel = null;
    if (captions.length) {
      const assPath = path.join(workDir, "captions.ass");
      await fs.writeFile(assPath, buildAss(captions, { ...size, font: cfg.captionFont }), "utf8");
      // Dùng đường dẫn tương đối: tránh lỗi escape với dấu cách / dấu ":" trong filter của FFmpeg
      assRel = path.relative(process.cwd(), assPath).split(path.sep).join("/");
    }
    const fontsRel =
      assRel && existsSync(fontsDir()) && readdirSync(fontsDir()).some((f) => /\.(ttf|otf)$/i.test(f))
        ? path.relative(process.cwd(), fontsDir()).split(path.sep).join("/")
        : null;

    let sfxEvents = [];
    let sfxFiles = {};
    if (options.sfx !== false && info.hasAudio) {
      try {
        sfxFiles = await ensureSfxFiles();
        sfxEvents = planSfx({ segments, captions, duration: outDuration });
      } catch (err) {
        warn(`Không tạo được sound effect: ${err.message}`);
      }
    }

    let encoder = cfg.videoEncoder;
    if (!caps.encoders.has(encoder)) {
      warn(`FFmpeg không có encoder ${encoder} → dùng libx264.`);
      encoder = "libx264";
    }
    report("preparing", 1);

    // ───────── 4. Render ─────────
    const cmd = ffmpeg(video.path);
    const sfxInputs = {};
    let inputIndex = 1;
    for (const type of SFX_NAMES) {
      if (sfxFiles[type] && sfxEvents.some((e) => e.type === type)) {
        cmd.input(sfxFiles[type]);
        sfxInputs[type] = inputIndex++;
      }
    }

    const { filter, maps } = buildFilterGraph({
      segments,
      fps,
      size,
      hasAudio: info.hasAudio,
      assPath: assRel,
      fontsDir: fontsRel,
      sfxEvents,
      sfxInputs,
    });

    cmd
      .complexFilter(filter, maps)
      .outputOptions(
        buildOutputOptions({
          encoder,
          fps,
          x264Preset: cfg.x264Preset,
          x264Crf: cfg.x264Crf,
          hwBitrate: cfg.hwBitrate,
        }),
      )
      .output(partPath);

    report("rendering", 0, `Render ${size.width}x${size.height}`);
    await runCommand(cmd, {
      signal,
      expectedDuration: outDuration,
      onProgress: (f) => report("rendering", f, `Render ${size.width}x${size.height}`),
      label: "render",
    });

    await fs.rename(partPath, finalPath);

    return {
      outputPath: finalPath,
      stats: {
        originalDuration: round(info.duration),
        outputDuration: round(outDuration),
        removedSeconds: round(info.duration - outDuration),
        cuts: Math.max(0, segments.length - 1),
        captions: captions.length,
        soundEffects: sfxEvents.length,
        resolution: `${size.width}x${size.height}`,
        fps,
        encoder,
      },
    };
  } catch (err) {
    await fs.rm(partPath, { force: true }).catch(() => {});
    throw err;
  } finally {
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}

const round = (n) => Math.round(n * 100) / 100;
