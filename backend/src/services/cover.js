/**
 * Ảnh bìa video: trình duyệt vẽ LỚP CHỮ (PNG trong suốt 2160×3840, đúng như bản xem trước),
 * server lấy khung hình ở giây người dùng chọn (độ phân giải gốc của video) → ghép chữ → ảnh bìa .jpg,
 * rồi (tuỳ chọn) chèn ảnh bìa vào ĐẦU video (0,1s: TikTok lấy khung đầu làm bìa mặc định; hoặc hiện 1s).
 *
 * Bản nháp skill: lưu bìa vào thư mục dự án → khi duyệt, bản chính tự chèn bìa (cùng mốc giây, cùng kịch bản).
 */
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { config } from "../config.js";
import { probe, runCommand, ffmpeg } from "./editor/ffmpeg.js";
import { videoEncoderOptions } from "./editor/filterGraph.js";

export const INSERT_CHOICES = [0, 0.1, 1];

export const coverFiles = (jobId) => ({
  overlay: path.join(config.outputDir, `${jobId}_cover_chu.png`),
  image: path.join(config.outputDir, `${jobId}_cover.jpg`),
  video: path.join(config.outputDir, `${jobId}_cover.mp4`),
});

/** Thư mục dự án (skill) — nơi giữ bìa của bản nháp cho bản chính dùng lại */
export const projectCover = (projectId) => {
  const dir = path.join(config.projectsDir, projectId);
  return { overlay: path.join(dir, "cover_chu.png"), meta: path.join(dir, "cover.json") };
};

/** Khung hình ở giây `time` + lớp chữ → ảnh bìa .jpg đúng độ phân giải video */
export async function renderCoverImage(videoPath, overlayPath, time, outJpg, { signal } = {}) {
  const info = await probe(videoPath);
  const t = Math.min(Math.max(0, time), Math.max(0, info.duration - 0.05));
  const W = info.width, H = info.height;
  const cmd = ffmpeg()
    .input(videoPath)
    .inputOptions(["-ss", t.toFixed(3)])
    .input(overlayPath)
    .complexFilter(
      `[0:v]scale=${W}:${H},setsar=1[b];[1:v]scale=${W}:${H}:force_original_aspect_ratio=decrease:flags=lanczos,format=rgba[o];[b][o]overlay=(W-w)/2:(H-h)/2:format=auto,format=yuvj420p[v]`,
      ["v"],
    )
    .outputOptions(["-frames:v", "1", "-q:v", "2", "-update", "1"])
    .output(outJpg);
  await runCommand(cmd, { signal, label: "anh-bia" });
  return { width: W, height: H, time: t };
}

/** Chèn ảnh bìa vào đầu video (giữ khớp tiếng: dời tiếng lùi đúng bằng thời lượng bìa) */
export async function buildCoverVideo(videoPath, coverJpg, insertSec, outMp4, { signal, onProgress } = {}) {
  const info = await probe(videoPath);
  const fps = info.fps || 30;
  const frames = Math.max(1, Math.round(insertSec * fps));
  const d = frames / fps;
  const ms = Math.round(d * 1000);
  const graph = [
    `[0:v]scale=${info.width}:${info.height},setsar=1,fps=${fps},format=yuv420p[c]`,
    `[1:v]setsar=1,fps=${fps},format=yuv420p[v]`,
    `[c][v]concat=n=2:v=1:a=0[vo]`,
    info.hasAudio ? `[1:a]adelay=${ms}:all=1[ao]` : `anullsrc=r=48000:cl=stereo,atrim=0:${(info.duration + d).toFixed(3)}[ao]`,
  ].join(";");
  const cmd = ffmpeg()
    .input(coverJpg)
    .inputOptions(["-loop", "1", "-framerate", String(fps), "-t", d.toFixed(4)])
    .input(videoPath)
    .complexFilter(graph, ["vo", "ao"])
    .outputOptions([
      ...videoEncoderOptions({ ...config.edit, encoder: config.edit.videoEncoder, fps }),
      "-c:a", "aac", "-b:a", "192k",
      "-movflags", "+faststart",
    ])
    .output(outMp4);
  await runCommand(cmd, { signal, expectedDuration: info.duration + d, onProgress, label: "chen-bia" });
}

/**
 * Áp bìa cho 1 video đầu ra.
 * @returns {Promise<{image:string, video:string|null, time:number}>}
 */
export async function applyCover({ jobId, videoPath, overlayPath, time, insert, signal, onProgress }) {
  const f = coverFiles(jobId);
  if (overlayPath !== f.overlay) await fs.copyFile(overlayPath, f.overlay);
  const img = await renderCoverImage(videoPath, f.overlay, time, f.image, { signal });
  await fs.rm(f.video, { force: true });
  if (insert > 0) {
    const tmp = `${f.video}.tmp.mp4`;
    await buildCoverVideo(videoPath, f.image, insert, tmp, { signal, onProgress });
    await fs.rename(tmp, f.video);
  }
  return { image: f.image, video: insert > 0 ? f.video : null, time: img.time };
}

export async function readProjectCover(projectId) {
  const p = projectCover(projectId);
  if (!existsSync(p.overlay) || !existsSync(p.meta)) return null;
  try {
    const meta = JSON.parse(await fs.readFile(p.meta, "utf8"));
    return { overlayPath: p.overlay, time: Number(meta.time) || 0, insert: INSERT_CHOICES.includes(meta.insert) ? meta.insert : 0.1 };
  } catch {
    return null;
  }
}

export async function saveProjectCover(projectId, overlayPath, { time, insert }) {
  const p = projectCover(projectId);
  await fs.mkdir(path.dirname(p.overlay), { recursive: true });
  await fs.copyFile(overlayPath, p.overlay);
  await fs.writeFile(p.meta, JSON.stringify({ time, insert }), "utf8");
}

export async function removeCover(jobId, projectId) {
  const f = coverFiles(jobId);
  await Promise.all([f.overlay, f.image, f.video].map((x) => fs.rm(x, { force: true })));
  if (projectId) {
    const p = projectCover(projectId);
    await Promise.all([p.overlay, p.meta].map((x) => fs.rm(x, { force: true })));
  }
}
