/**
 * Chuẩn bị nguồn cho skill:
 *  - 1 clip (dọc hay ngang) → dùng thẳng file gốc, GIỮ NGUYÊN chiều khung (video ngang ra video ngang)
 *  - nhiều clip → chiều khung theo đa số (tính theo thời lượng): dọc 1080×1920 hoặc ngang 1920×1080;
 *    clip khác chiều đặt vừa khung trên nền mờ của chính nó (KHÔNG cắt mất hình). 30/60fps, tiếng 48kHz stereo
 * Ghi lại mốc đầu/cuối của từng clip để AI biết cảnh nào thuộc clip nào.
 *
 * Trích khung hình (để Claude XEM video và chọn đoạn không lời đáng giữ).
 */
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { probe, runCommand, ffmpeg, getCapabilities } from "../editor/ffmpeg.js";
import { runPython } from "./python.js";

/** Lấp đầy khung TW×TH (cùng chiều: cắt rất ít mép; có crop riêng = khung đi theo người) */
const fillVf = (TW, TH, fps, crop = `crop=${TW}:${TH}`) =>
  `scale=${TW}:${TH}:force_original_aspect_ratio=increase:flags=lanczos,${crop},setsar=1,fps=${fps},format=yuv420p`;
/** Khác chiều: đặt trọn hình vào giữa, nền là chính clip đó phóng to + làm mờ (không mất nội dung) */
const fitBlurVf = (TW, TH, fps) =>
  `split[a][b];[a]scale=${TW}:${TH}:force_original_aspect_ratio=increase,crop=${TW}:${TH},gblur=sigma=28,eq=brightness=-0.08[bg];` +
  `[b]scale=${TW}:${TH}:force_original_aspect_ratio=decrease:flags=lanczos[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2,setsar=1,fps=${fps},format=yuv420p`;
const NORM_OUT = ["-c:v", "libx264", "-preset", "veryfast", "-crf", "14", "-c:a", "pcm_s16le", "-ar", "48000", "-ac", "2"];

/** Đường dẫn trong filtergraph (thư mục "GLT EDITOR" có dấu cách; Windows có ":") */
const fgPath = (p) => `'${p.replace(/\\/g, "/").replace(/'/g, "'\\''")}'`;

/**
 * Clip ngang → khung dọc ĐI THEO NGƯỜI: reframe.py (mô hình tách người RVM) cho quỹ đạo khung cắt,
 * đổi thành lệnh sendcmd cho filter crop. Không có mô hình / không thấy người → null (cắt giữa).
 */
async function reframeCrop(clip, info, proj, idx, { python, scripts, signal }) {
  const w = 480;
  const h = Math.max(2, Math.round((w * info.height) / info.width / 2) * 2);
  let traj = null;
  await runPython(python, [path.join(scripts, "reframe.py"), clip.path, "--size", `${w}x${h}`, "--fps", "4"], {
    cwd: scripts,
    signal,
    label: "reframe",
    onLine: (l) => {
      const m = l.match(/^REFRAME (.*)$/);
      if (m) traj = JSON.parse(m[1]);
    },
  });
  if (!traj?.x?.length) return null;
  const sw = Math.round((1920 * info.width) / info.height / 2) * 2; // bề rộng sau khi thu về cao 1920 (video ra dọc)
  const maxX = Math.max(0, sw - 1080);
  const lines = [];
  const step = 0.1; // 10 lệnh/giây, nội suy tuyến tính giữa các mẫu → lia mượt
  for (let t = 0; t <= info.duration + step; t += step) {
    const f = t * traj.fps;
    const i = Math.min(traj.x.length - 1, Math.floor(f));
    const j = Math.min(traj.x.length - 1, i + 1);
    const v = traj.x[i] + (traj.x[j] - traj.x[i]) * (f - i);
    lines.push(`${t.toFixed(2)} crop@rf x ${Math.round(Math.min(maxX, Math.max(0, v * sw)))};`);
  }
  const cmdFile = path.join(proj, `reframe_${idx}.cmd`);
  await fs.writeFile(cmdFile, lines.join("\n"), "utf8");
  const x0 = Math.round(Math.min(maxX, Math.max(0, traj.x[0] * sw)));
  return `sendcmd=f=${fgPath(cmdFile)},crop@rf=1080:1920:${x0}:0`;
}

/** Đưa 1 clip về chuẩn chung (thiếu tiếng → chèn tiếng câm để nối được) */
async function normalizeClip(clip, info, out, { signal, onProgress, fps = 30, crop, size: [TW, TH] = [1080, 1920] }) {
  const cmd = ffmpeg(clip.path);
  const sameShape = info.width > info.height === TW > TH;
  const vf = crop || sameShape ? fillVf(TW, TH, fps, crop) : fitBlurVf(TW, TH, fps);
  if (info.hasAudio) {
    cmd.videoFilters(vf).outputOptions(["-map", "0:v:0", "-map", "0:a:0", ...NORM_OUT]);
  } else {
    // Dùng filter nguồn anullsrc (có trong mọi bản FFmpeg, không cần thiết bị lavfi)
    cmd
      .complexFilter(`[0:v]${vf}[v];anullsrc=r=48000:cl=stereo,atrim=0:${info.duration.toFixed(3)}[a]`, ["v", "a"])
      .outputOptions(NORM_OUT);
  }
  cmd.outputOptions(["-t", info.duration.toFixed(3)]).output(out);
  await runCommand(cmd, { signal, expectedDuration: info.duration, onProgress, label: "chuan-hoa-clip" });
}

/**
 * Làm đẹp nguồn (tuỳ chọn): chống rung (vidstab 2 lượt, thiếu thì deshake) + lọc gió/ồn cho giọng nói.
 * Chỉ lọc tiếng → giữ nguyên hình (copy), rất nhanh.
 */
async function enhanceSource(srcPath, info, proj, { stabilize, denoise, signal, report, warn }) {
  if (!stabilize && !denoise) return null;
  const caps = await getCapabilities().catch(() => ({ filters: new Set() }));
  const out = path.join(proj, "nguon_tot.mov");
  const vf = [];
  if (stabilize) {
    if (caps.filters?.has("vidstabdetect") && caps.filters?.has("vidstabtransform")) {
      const trf = path.join(proj, "rung.trf");
      report("transcribing", 0.32, "Chống rung: phân tích chuyển động");
      const detect = ffmpeg(srcPath)
        .videoFilters(`vidstabdetect=shakiness=6:accuracy=12:result=${fgPath(trf)}`)
        .outputOptions(["-an", "-f", "null"])
        .output("-");
      await runCommand(detect, {
        signal,
        expectedDuration: info.duration,
        label: "vidstab-1",
        onProgress: (f) => report("transcribing", 0.32 + f * 0.08, "Chống rung: phân tích chuyển động"),
      });
      vf.push(`vidstabtransform=input=${fgPath(trf)}:smoothing=18:zoom=2:optzoom=0:interpol=bicubic`, "unsharp=5:5:0.5:3:3:0");
    } else {
      vf.push("deshake=rx=32:ry=32:edge=mirror");
      warn("FFmpeg không có vidstab → chống rung kiểu đơn giản (cài ffmpeg-full để chống rung tốt hơn).");
    }
  }
  const af = denoise && info.hasAudio ? "highpass=f=90,afftdn=nr=14:nf=-32:tn=1,lowpass=f=12500" : null;
  const cmd = ffmpeg(srcPath);
  if (vf.length) cmd.videoFilters([...vf, "format=yuv420p"].join(","));
  if (af) cmd.audioFilters(af);
  cmd
    .outputOptions([
      "-map", "0:v:0", ...(info.hasAudio ? ["-map", "0:a:0"] : []),
      ...(vf.length ? ["-c:v", "libx264", "-preset", "veryfast", "-crf", "14"] : ["-c:v", "copy"]),
      ...(info.hasAudio ? ["-c:a", "pcm_s16le", "-ar", "48000", "-ac", "2"] : []),
    ])
    .output(out);
  const label = [stabilize && "chống rung", af && "lọc gió & tiếng ồn"].filter(Boolean).join(" + ");
  await runCommand(cmd, {
    signal,
    expectedDuration: info.duration,
    label: "lam-dep-nguon",
    onProgress: (f) => report("transcribing", 0.4 + f * 0.1, `Làm đẹp nguồn: ${label}`),
  });
  return out;
}

/**
 * @param {Array<{path:string, originalName:string}>} videos  theo thứ tự ghép
 * @param {object} opts
 * @param {boolean} [opts.keep60]     giữ 60fps khi clip quay 60fps (video chill → quay chậm mượt)
 * @param {{python:string, scripts:string}|null} [opts.reframe]  clip ngang: khung đi theo người
 * @param {boolean} [opts.stabilize]  chống rung
 * @param {boolean} [opts.denoise]    lọc gió / tiếng ồn (video có lời)
 * @returns {Promise<{srcPath:string, duration:number, clips:Array<{name:string,start:number,end:number,landscape:boolean}>, info:object}>}
 */
export async function prepareSource(videos, proj, opts) {
  const manifest = path.join(proj, "nguon.json");
  if (existsSync(manifest)) return JSON.parse(await fs.readFile(manifest, "utf8")); // dựng bản chính: dùng lại
  const result = await buildSource(videos, proj, opts);
  const better = await enhanceSource(result.srcPath, result.info, proj, opts);
  if (better) {
    result.srcPath = better;
    result.info = await probe(better);
    result.enhanced = { stabilize: Boolean(opts.stabilize), denoise: Boolean(opts.denoise) };
  }
  await fs.writeFile(manifest, JSON.stringify(result, null, 2), "utf8");
  return result;
}

async function buildSource(videos, proj, { signal, report, warn, keep60 = false, reframe = null }) {
  const infos = [];
  for (const v of videos) infos.push(await probe(v.path));

  // 1 clip → dùng thẳng, giữ nguyên chiều khung (ngang vẫn là ngang)
  if (videos.length === 1) {
    const landscape = infos[0].width > infos[0].height;
    return {
      srcPath: videos[0].path,
      duration: infos[0].duration,
      clips: [{ name: videos[0].originalName, start: 0, end: infos[0].duration, landscape }],
      info: infos[0],
      orientation: landscape ? "ngang" : "doc",
    };
  }
  // Nhiều clip: chiều khung theo đa số thời lượng
  const landDur = infos.reduce((a, i) => a + (i.width > i.height ? i.duration : 0), 0);
  const landscapeOut = landDur > infos.reduce((a, i) => a + i.duration, 0) / 2;
  const size = landscapeOut ? [1920, 1080] : [1080, 1920];
  // Clip quay 60fps + video chill → giữ 60fps (quay chậm 0.5× vẫn mượt); còn lại 30fps
  const fps = keep60 && infos.some((i) => (i.fps ?? 30) >= 50) ? 60 : 30;
  let followed = 0;

  const total = infos.reduce((s, i) => s + i.duration, 0);
  const parts = [];
  let done = 0;
  for (let i = 0; i < videos.length; i++) {
    const out = path.join(proj, `clip_${String(i + 1).padStart(2, "0")}.mov`);
    let crop;
    // Chỉ khi video ra DỌC mà lẫn clip ngang và người dùng bật "khung đi theo người" → cắt dọc theo người
    if (reframe && !landscapeOut && infos[i].width > infos[i].height) {
      report("transcribing", (done / total) * 0.3, `Clip ${i + 1}: tìm người để khung dọc đi theo`);
      crop = await reframeCrop(videos[i], infos[i], proj, i + 1, { ...reframe, signal }).catch((err) => {
        if (signal?.aborted) throw err;
        warn(`Không dò được người trong clip ${i + 1} (${err.message.split("\n")[0]}) → cắt giữa.`);
        return null;
      });
      if (crop) followed++;
    }
    const label = `Chuẩn hoá clip ${i + 1}/${videos.length}`;
    await normalizeClip(videos[i], infos[i], out, {
      signal,
      fps,
      size,
      crop: crop ?? undefined,
      onProgress: (f) => report("transcribing", ((done + f * infos[i].duration) / total) * 0.3, label),
    });
    done += infos[i].duration;
    parts.push(out);
  }

  let srcPath = parts[0];
  if (parts.length > 1) {
    report("transcribing", 0.3, `Ghép ${parts.length} clip`);
    const list = path.join(proj, "ghep.txt");
    await fs.writeFile(list, parts.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join("\n"), "utf8");
    srcPath = path.join(proj, "nguon_ghep.mov");
    const cmd = ffmpeg()
      .input(list)
      .inputOptions(["-f", "concat", "-safe", "0"])
      .outputOptions(["-c", "copy"])
      .output(srcPath);
    await runCommand(cmd, { signal, label: "ghep-clip" });
  }

  // Mốc từng clip (theo thời lượng thật của file đã chuẩn hoá)
  const clips = [];
  let t = 0;
  for (let i = 0; i < parts.length; i++) {
    const d = (await probe(parts[i])).duration;
    clips.push({ name: videos[i].originalName, start: round(t), end: round(t + d), landscape: infos[i].width > infos[i].height });
    t += d;
  }
  const odd = clips.filter((c) => c.landscape !== landscapeOut).length - followed;
  if (odd > 0) {
    warn(`Video ra khung ${landscapeOut ? "NGANG" : "DỌC"} (theo đa số clip) — ${odd} clip ${landscapeOut ? "dọc" : "ngang"} được đặt vừa khung trên nền mờ, không bị cắt.`);
  }

  return { srcPath, duration: t, clips, info: await probe(srcPath), orientation: landscapeOut ? "ngang" : "doc" };
}

/**
 * Trích khung hình đều nhau (tối đa ~maxFrames khung, cao 384px) để Claude xem.
 * @returns {Promise<Array<{t:number, data:string}>>} data = JPEG base64
 */
export async function extractFrames(srcPath, duration, proj, { signal, maxFrames = 72 } = {}) {
  const dir = path.join(proj, "khung");
  await fs.rm(dir, { recursive: true, force: true });
  await fs.mkdir(dir, { recursive: true });
  const interval = Math.max(1, Math.ceil(duration / maxFrames));
  const cmd = ffmpeg(srcPath)
    .videoFilters(`fps=1/${interval},scale=-2:384`)
    .outputOptions(["-q:v", "6", "-an"])
    .output(path.join(dir, "k_%04d.jpg"));
  await runCommand(cmd, { signal, label: "trich-khung" });

  const files = (await fs.readdir(dir)).filter((f) => f.endsWith(".jpg")).sort();
  const frames = [];
  for (let i = 0; i < files.length; i++) {
    const t = i * interval;
    if (t > duration) break;
    frames.push({ t, data: (await fs.readFile(path.join(dir, files[i]))).toString("base64") });
  }
  return frames;
}

const round = (n) => Math.round(n * 1000) / 1000;
