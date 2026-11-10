/**
 * Chạy skill reel-doc-3d trong web, đúng quy trình SKILL.md:
 *   gỡ băng (go_bang.py) → kịch bản (Claude đọc SKILL.md) → du_an.py → chạy khô (thu_broll.py)
 *   → dựng hình (reel_engine.py) → âm thanh (mix_engine.py) → [nâng 4K]
 *
 * Bản nháp 720p trước; người dùng duyệt rồi mới ra bản chính 1080×1920 (dùng lại cùng thư mục dự án).
 */
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { config } from "../../config.js";
import { runPython } from "./python.js";
import { pythonFor, readSkillMd, readTemplates, skillDir, syncMusic, musicCategories } from "./registry.js";
import {
  readTranscript,
  planWithClaude,
  heuristicPlan,
  validatePlan,
  buildDuAnPy,
  claudeEnabled,
} from "./planner.js";
import { probe, runCommand, ffmpeg } from "../editor/ffmpeg.js";
import { prepareSource, extractFrames } from "./sources.js";
import { isVoiceless, loadTracks, planMontageWithClaude, heuristicMontage } from "./montage.js";
import { videoEncoderOptions } from "../editor/filterGraph.js";
import { finishVideo } from "./finish.js";
import { activeCta } from "../brand.js";
import { GRADES, GRADE_LABELS } from "./planner.js";
import os from "node:os";

const MINTERP = "minterpolate=fps=60:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1:scd=fdiff:scd_threshold=8";

/**
 * 30fps → 60fps bằng nội suy chuyển động. minterpolate chỉ chạy 1 nhân → chia video thành nhiều đoạn
 * (theo số khung, mỗi đoạn lấn vài khung + đệm cuối rồi cắt đúng số khung → không hụt/thừa ở mối nối) chạy song song trên mọi nhân CPU.
 * Cảnh cắt (đổi cảnh) được nhận ra (scd) → không tạo khung "nhoè" giữa 2 cảnh.
 * @returns {Promise<string>} file danh sách concat (chỉ hình, 1080p 60fps)
 */
export async function interpolate60(src, info, workDir, { signal, onProgress }) {
  await fs.rm(workDir, { recursive: true, force: true });
  await fs.mkdir(workDir, { recursive: true });
  const fps = info.fps || 30;
  const total = Math.max(1, Math.round(info.duration * fps));
  const cores = os.availableParallelism?.() ?? os.cpus().length;
  const n = Math.max(1, Math.min(cores > 2 ? cores - 1 : cores, 8, Math.floor(total / (fps * 2)) || 1));
  const per = Math.ceil(total / n);
  const ratio = 60 / fps;
  const ctrl = new AbortController();
  const onAbort = () => ctrl.abort();
  signal?.addEventListener("abort", onAbort);
  const done = new Array(n).fill(0);
  const parts = [];
  try {
    await Promise.all(
      Array.from({ length: n }, (_, i) => {
        const a = i * per;
        const b = Math.min(total, a + per);
        const outFrames = Math.round((b - a) * ratio);
        const part = path.join(workDir, `p${String(i).padStart(2, "0")}.mp4`);
        parts.push(part);
        const cmd = ffmpeg(src)
          .videoFilters(`trim=start_frame=${a}:end_frame=${Math.min(total, b + 3)},setpts=PTS-STARTPTS,tpad=stop_mode=clone:stop=3,${MINTERP},trim=end_frame=${outFrames}`)
          .outputOptions(["-an", "-c:v", "libx264", "-preset", "ultrafast", "-crf", "10", "-pix_fmt", "yuv420p", "-r", "60"])
          .output(part);
        return runCommand(cmd, {
          signal: ctrl.signal,
          expectedDuration: (b - a) / fps,
          label: `noi-suy-60fps-${i}`,
          onProgress: (f) => {
            done[i] = f;
            onProgress?.(done.reduce((x, y) => x + y, 0) / n);
          },
        }).catch((err) => {
          ctrl.abort(); // 1 đoạn lỗi → dừng các đoạn còn lại
          throw err;
        });
      }),
    );
  } finally {
    signal?.removeEventListener("abort", onAbort);
  }
  const list = path.join(workDir, "list.txt");
  await fs.writeFile(list, parts.sort().map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join("\n"), "utf8");
  return list;
}

export const SKILL_STAGES = {
  transcribing: [0, 14],
  planning: [14, 20],
  checking: [20, 23],
  rendering: [23, 88],
  mixing: [88, 97],
  upscaling: [97, 99],
};
export const SKILL_STEPS = [
  { stage: "transcribing", label: "Gỡ băng" },
  { stage: "planning", label: "AI lên kịch bản" },
  { stage: "checking", label: "Chạy khô B-roll" },
  { stage: "rendering", label: "Dựng hình 3D" },
  { stage: "mixing", label: "Âm thanh & xuất" },
];

export const projectDir = (projectId) => path.join(config.projectsDir, projectId);

/** Bộ màu: người dùng chọn cụ thể → dùng; "tu-dong" → bộ AI chọn theo khung hình (không có AI → tự nhiên) */
export function resolveGrade(option, aiChoice) {
  const id = option && option !== "tu-dong" && option in GRADES ? option : aiChoice && aiChoice in GRADES ? aiChoice : "tu-nhien";
  return { id, label: GRADE_LABELS[id], filter: GRADES[id] };
}

/** Khung video ra: NGANG giữ ngang (không cắt về dọc), DỌC như cũ */
export function frameOf(src) {
  const landscape = src.orientation ? src.orientation === "ngang" : (src.info?.width ?? 0) > (src.info?.height ?? 1);
  return landscape
    ? { landscape, size: [1920, 1080], res: "1920x1080", draftRes: "1280x720", k4: "3840x2160", label: "1920×1080" }
    : { landscape, size: [1080, 1920], res: "1080x1920", draftRes: "720x1280", k4: "2160x3840", label: "1080×1920" };
}

/** Các tuỳ chọn dựng du_an.py (lưu lại để "chỉnh nhanh" dựng lại không cần AI) */
export function duAnOptions(srcPath, music, options, gradeFilter, outRes = [1080, 1920]) {
  return {
    outRes,
    src: srcPath,
    outName: "reel",
    music,
    matte: options.matte ?? config.skill.matte,
    transition: options.transition ?? "muot",
    phude: options.captionStyle === "cum" ? "cum" : "tung-tu",
    hook: options.hook !== false,
    grade: gradeFilter,
  };
}

/** Báo tiến trình theo thời gian cho bước không in % (gỡ băng, mix) */
function timeProgress(report, stage, estimateSec, message) {
  const t0 = Date.now();
  const timer = setInterval(() => {
    const f = Math.min(0.95, (Date.now() - t0) / 1000 / Math.max(5, estimateSec));
    report(stage, f, message);
  }, 1500);
  return () => clearInterval(timer);
}

/** Đổi các dòng "!!" (cảnh báo) của engine sang tiếng Việt dễ hiểu; null = bỏ qua */
function engineWarning(line, { hasMusic }) {
  const l = line.trim().replace(/^!!\s*/, "");
  if (/^nhac ngan hon video/.test(l)) return hasMusic ? "Nhạc nền ngắn hơn video — thêm bài thứ 2 vào lựa chọn nhạc." : null;
  if (/^khong thay rvm/.test(l)) return "Chưa có mô hình tách phông RVM → dùng u2net (chạy npm run skill:setup để tải bản nét hơn).";
  if (/^so tu khop MANUAL/.test(l)) return `Kịch bản lệch số từ: ${l}`;
  return l;
}

/** Đọc các dòng tổng kết mà reel_engine / mix_engine in ra */
function parseStats(lines) {
  const stats = {};
  for (const l of lines) {
    let m = l.match(/(\d+)x(\d+) \| ([\d.]+)s \(x([\d.]+)\) \| (\d+) cum \| (\d+) B-roll/);
    if (m) Object.assign(stats, { outputDuration: +m[3], speed: +m[4], clusters: +m[5], broll: +m[6] });
    m = l.match(/(\d+)x(\d+) \| ([\d.]+)s \| (\d+) canh \| nhac (\S+) ([\d.]+) BPM/);
    if (m) Object.assign(stats, { outputDuration: +m[3], shots: +m[4], music: m[5], bpm: Math.round(+m[6]), loudnessLufs: -14 });
    m = l.match(/(\d+) hieu ung am thanh \| (\d+) lan doi nen/);
    if (m) Object.assign(stats, { soundEffects: +m[1], backgroundSwitches: +m[2] });
    m = l.match(/ket qua: I=([-\d.]+) LUFS\s+TP=([-\d.]+)/);
    if (m) Object.assign(stats, { loudnessLufs: +m[1], truePeakDb: +m[2] });
  }
  return stats;
}

/**
 * Nhạc cho video VOICE (có lời thuyết minh): lấy trong thư mục nhac/nhac_nen_voice.
 * Thứ tự: người dùng chọn tay trên web → bài SKILL_VOICE_MUSIC nếu nằm trong thư mục voice → bài voice đầu tiên
 * → (thư mục voice trống) bài SKILL_VOICE_MUSIC kiểu cũ nếu còn. Chọn "Không nhạc" ([]) → không nhạc.
 */
function voiceMusicFor(cats, options, warn) {
  const picked = options.music;
  if (Array.isArray(picked) && !picked.includes("auto")) return picked; // chọn tay (kể cả [] = không nhạc)
  const pref = config.skill.voiceMusic;
  const voice = cats.voice;
  const hit = voice.find((n) => n === pref || n === `voice-${pref}`) ?? voice[0];
  if (hit) return [hit];
  const all = [...cats.other, ...cats.chill];
  if (all.includes(pref)) return [pref];
  warn("Thư mục nhac/nhac_nen_voice chưa có bài nào → video không có nhạc nền. Thả nhạc vào thư mục đó rồi bấm Thử lại.");
  return [];
}

/** Đọc lại thư viện nhạc (quét thư mục voice/chill, xử lý bài mới) — lỗi thì vẫn dựng tiếp với nhạc đã có */
async function refreshMusic(skill, { report, warn, signal }) {
  try {
    const res = await syncMusic(skill.id, {
      signal,
      onLine: (l) => {
        const m = l.match(/nhac (\d+)\/(\d+): (\S+)/);
        if (m) report("transcribing", 0, `Chuẩn bị nhạc mới ${m[1]}/${m[2]} (${m[3]})`);
      },
    });
    if (res) return res.cats;
  } catch (err) {
    if (signal.aborted) throw err;
    warn(`Không quét được thư viện nhạc: ${err.message}`);
  }
  return musicCategories(skillDir(skill.id));
}

/** Video không lời: chọn nhạc + lên montage (Claude xem hình / tự động) → montage.json + review.json */
async function planMontageStep({ dir, python, proj, srcPath, info, src, skill, options, cats, report, warn, signal }) {
  report("planning", 0.02, "Video chill → montage theo nhạc: phân tích nhịp nhạc");
  const tracks = await loadTracks(dir, python, { signal });
  if (!tracks.length) {
    throw new Error("Video chill cần nhạc nền → thả nhạc vào thư mục nhac/nhac_nen_chill của skill rồi bấm Thử lại.");
  }
  const chosen = (options.music ?? []).find((m) => m !== "auto");
  const fixedMusic = chosen && tracks.some((t) => t.name === chosen) ? chosen : undefined;
  // Video chill: AI tự chọn bài hợp hình CHỈ trong thư mục chill (nhac/nhac_nen_chill)
  let pool = tracks;
  if (!fixedMusic) {
    const chill = tracks.filter((t) => cats.chill.includes(t.name));
    if (chill.length) pool = chill;
    else {
      const notVoice = tracks.filter((t) => !cats.voice.includes(t.name) && t.name !== config.skill.voiceMusic);
      pool = notVoice.length ? notVoice : tracks;
      warn("Thư mục nhac/nhac_nen_chill chưa có bài nào → tạm chọn trong nhạc còn lại. Thả nhạc chill vào thư mục đó để AI chọn chuẩn hơn.");
    }
  }

  let result;
  let source = "heuristic";
  if (claudeEnabled()) {
    try {
      report("planning", 0.1, "Trích khung hình cho AI xem");
      const frames = await extractFrames(srcPath, info.duration, proj, { signal, maxFrames: 90 });
      report("planning", 0.25, `Claude đang xem ${frames.length} khung hình, chọn nhạc + cảnh`);
      result = await planMontageWithClaude({
        skillMd: await readSkillMd(skill.id),
        frames,
        clips: src.clips,
        duration: info.duration,
        tracks: pool,
        fixedMusic,
        signal,
        fps: info.fps ?? 30,
      });
      source = "claude";
    } catch (err) {
      if (signal.aborted) throw err;
      warn(`Claude không lên được montage (${err.message}) → dùng montage tự động.`);
    }
  } else {
    warn("Chưa có ANTHROPIC_API_KEY → montage tự động (không xem được hình để chọn cảnh/nhạc).");
  }
  if (!result) {
    result = heuristicMontage({ duration: info.duration, clips: src.clips, tracks: pool, fixedMusic });
    if (result.errors.length) throw new Error(`Không dựng được montage: ${result.errors[0]} (video quá ngắn?)`);
  }

  const { plan } = result;
  plan.ambient = 0; // video chill: TẮT hẳn tiếng gốc, chỉ còn nhạc
  plan.title = ""; // video chill: không chèn chữ / POV
  const grade = resolveGrade(options.grade, plan.grade);
  plan.grade = grade.filter ?? "";
  await fs.writeFile(path.join(proj, "montage.json"), JSON.stringify({ src: srcPath, ...plan, size: frameOf(src).size }, null, 2), "utf8");
  const track = tracks.find((t) => t.name === plan.music);
  const review = {
    mode: "montage",
    planner: source,
    summary: plan.summary,
    music: plan.music,
    title: plan.title ?? "",
    grade: grade.label,
    bpm: track ? Math.round(track.bpm) : null,
    shots: plan.shots,
    montageSeconds: Math.round(result.seconds * 10) / 10,
    clips: src.clips.length,
    uncertain: [],
    speed: 1,
    clusters: 0,
    broll: [],
    behind: [],
    dark: 0,
    scenes: [],
  };
  await fs.writeFile(path.join(proj, "review.json"), JSON.stringify(review, null, 2), "utf8");
  report("planning", 1, `Montage ${plan.shots.length} cảnh theo nhạc "${plan.music}"`);
  return review;
}

/**
 * @param {object} p
 * @param {string} p.jobId
 * @param {{path:string, originalName:string}} p.video
 * @param {object} p.skill            từ registry.getSkill
 * @param {{mode:'draft'|'final', projectId:string, music?:string[], export4k?:boolean, matte?:string}} p.options
 */
export async function runSkillEdit({ jobId, video, skill, options, report, warn, signal }) {
  const dir = skillDir(skill.id);
  const scripts = path.join(dir, "scripts");
  const python = pythonFor(dir);
  if (!python) {
    throw new Error(`Skill "${skill.id}" chưa cài môi trường Python. Chạy trong thư mục backend: npm run skill:setup`);
  }
  if (!skill.status.fonts) {
    throw new Error(`Skill "${skill.id}" chưa có font. Chạy trong thư mục backend: npm run skill:setup`);
  }

  const draft = options.mode !== "final";
  const proj = projectDir(options.projectId);
  await fs.mkdir(proj, { recursive: true });
  const montageFile = path.join(proj, "montage.json");
  let isMontage = existsSync(montageFile); // bản chính của montage: dùng lại kịch bản đã duyệt
  const reuse = isMontage || (existsSync(path.join(proj, "du_an.py")) && existsSync(path.join(proj, "tj.json")));
  let review = null;

  // ───── 0. Nguồn: 1 clip dọc dùng thẳng; nhiều clip / clip ngang → chuẩn hoá 1080×1920 rồi nối ─────
  const videos = options.videos?.length ? options.videos : [video];
  const src = await prepareSource(videos, proj, {
    signal,
    report,
    warn,
    keep60: options.videoType === "chill",
    reframe: options.reframe === false ? null : { python, scripts },
    stabilize: Boolean(options.stabilize),
    denoise: Boolean(options.denoise) && options.videoType !== "chill",
  });
  const srcPath = src.srcPath;
  const info = { ...src.info, duration: src.duration };
  const frame = frameOf(src);

  // Thư viện nhạc: quét thư mục voice/chill (bài mới được chuẩn bị tự động)
  const cats = reuse ? await musicCategories(dir) : await refreshMusic(skill, { report, warn, signal });

  // Loại video người dùng chọn trên web: "voice" (có lời thuyết minh) | "chill" (không lời) | không chọn = tự nhận
  const videoType = options.videoType;
  if (!reuse && videoType === "chill") {
    isMontage = true; // chill → montage theo nhạc, khỏi gỡ băng
    report("transcribing", 1, "Video chill → montage theo nhạc (tắt tiếng gốc)");
  } else if (!reuse && !info.hasAudio && videoType !== "voice") {
    // Không có tiếng → chắc chắn không lời → montage (bỏ qua gỡ băng)
    isMontage = options.montage !== "off";
    if (!isMontage) throw new Error("Video không có âm thanh — chỉ dựng được montage theo nhạc.");
    report("transcribing", 1, "Video không có tiếng → montage theo nhạc");
  } else if (!reuse) {
    // ───── 1. Gỡ băng ─────
    const stop = timeProgress(report, "transcribing", info.duration * 1.2 + 30, "Gỡ băng lời nói (lần đầu sẽ tải mô hình Whisper)");
    try {
      await runPython(python, [path.join(scripts, "go_bang.py"), srcPath, proj], {
        cwd: scripts,
        signal,
        label: "go_bang",
        onLine: (l) => /GPU|CPU/.test(l) && report("transcribing", 0.05, l.trim()),
      });
    } finally {
      stop();
    }
    report("transcribing", 1, "Đã gỡ băng");

    // Video KHÔNG LỜI → montage theo nhạc (trừ khi người dùng tắt)
    const { words } = readTranscript(JSON.parse(await fs.readFile(path.join(proj, "tj.json"), "utf8")));
    isMontage =
      videoType === "voice"
        ? false // người dùng nói rõ là video thuyết minh → luôn edit kiểu nói chuyện
        : options.montage === "on" || (options.montage !== "off" && isVoiceless(words, info.duration));
    if (isMontage) report("transcribing", 1, `Gần như không có lời (${words.length} chữ) → montage theo nhạc`);
  }

  if (!reuse && isMontage) {
    review = await planMontageStep({ dir, python, proj, srcPath, info, src, skill, options, cats, report, warn, signal });
  } else if (!reuse) {
    const tj = JSON.parse(await fs.readFile(path.join(proj, "tj.json"), "utf8"));
    const { words, pauses } = readTranscript(tj);
    const templates = readTemplates(dir);

    let result;
    let source = "heuristic";
    if (claudeEnabled()) {
      try {
        report("planning", 0.05, "Trích khung hình cho AI xem");
        const frames = await extractFrames(srcPath, info.duration, proj, { signal });
        report("planning", 0.15, `Claude đang xem ${frames.length} khung hình + đọc lời thoại`);
        const skillMd = await readSkillMd(skill.id);
        result = await planWithClaude({
          skillMd,
          templates,
          words,
          pauses,
          duration: info.duration,
          clips: src.clips,
          frames,
          signal,
          onAttempt: (n) => n > 1 && report("planning", 0.6, `Claude sửa kịch bản (lần ${n})`),
        });
        source = "claude";
      } catch (err) {
        if (signal.aborted) throw err;
        warn(`Claude không lên được kịch bản (${err.message}) → dùng kịch bản tự động.`);
      }
    } else {
      warn("Chưa có ANTHROPIC_API_KEY → kịch bản tự động (không xem được hình, không bỏ câu vấp, không chọn B-roll thông minh).");
    }
    if (!result) {
      result = validatePlan(heuristicPlan(words, pauses, { duration: info.duration, clips: src.clips }), words, templates, {
        duration: info.duration,
      });
      if (result.errors.length) throw new Error(`Kịch bản tự động lỗi: ${result.errors[0]}`);
    }
    result.warnings.forEach(warn);

    const grade = resolveGrade(options.grade, result.plan.grade);
    const duOpts = duAnOptions(srcPath, voiceMusicFor(cats, options, warn), options, grade.filter, frameOf(src).size);
    const writePlan = async (plan) => {
      await fs.writeFile(path.join(proj, "du_an.py"), buildDuAnPy(plan, duOpts), "utf8");
      // Lưu kịch bản dạng JSON → "chỉnh nhanh" (sửa chữ, bỏ cảnh, đổi nhạc) dựng lại không cần AI
      await fs.writeFile(path.join(proj, "plan.json"), JSON.stringify({ plan, duOpts }, null, 2), "utf8");
    };
    // Phong cách đã chốt: không B-roll 3D, không tách phông (engine cũng tự bỏ qua nếu còn sót)
    let plan = { ...result.plan, broll: [], behind: [], dark: [] };
    await writePlan(plan);
    report("planning", 1, "Đã có kịch bản");

    // ───── 3. Chạy khô B-roll — mẫu nào lỗi thì bỏ, dựng tiếp ─────
    if (plan.broll.length) {
      report("checking", 0.1, "Chạy khô từng khung B-roll");
      const lines = await runPython(python, [path.join(scripts, "thu_broll.py"), proj], {
        cwd: scripts,
        signal,
        label: "thu_broll",
      }).catch((err) => {
        if (signal.aborted) throw err;
        return (err.log ?? "").split("\n").concat("XONG - LOI");
      });
      const bad = lines
        .map((l) => l.match(/!! LOI (\w+) \(cum (\d+)-(\d+)\)/))
        .filter(Boolean)
        .map((m) => `${m[1]}:${m[2]}`);
      if (bad.length) {
        plan = { ...plan, broll: plan.broll.filter((b) => !bad.includes(`${b.template}:${b.from}`)) };
        warn(`Bỏ ${bad.length} B-roll vẽ bị lỗi: ${bad.join(", ")}`);
        await writePlan(plan);
      }
    }
    report("checking", 1);

    review = {
      planner: source,
      summary: plan.summary,
      uncertain: plan.uncertain,
      speed: plan.speed,
      clusters: plan.manual.length,
      scenes: plan.scenes ?? [],
      clips: src.clips.length,
      broll: plan.broll.map((b) => ({ template: b.template, from: b.from, to: b.to })),
      behind: plan.behind.map((b) => b.word),
      dark: plan.dark.length,
      grade: grade.label,
      hook:
        plan.hook && duOpts.hook
          ? { text: words.slice(plan.hook.from, plan.hook.to + 1).map((w) => w.x).join(" "), reason: plan.hook.reason }
          : null,
    };
    await fs.writeFile(path.join(proj, "review.json"), JSON.stringify(review, null, 2), "utf8");
  } else {
    review = JSON.parse(await fs.readFile(path.join(proj, "review.json"), "utf8").catch(() => "null"));
    report("checking", 1, "Dùng lại kịch bản đã duyệt");
  }

  const flag = draft ? ["--draft"] : [];
  let produced;
  let engineLines = [];
  let mixLines = [];
  if (isMontage) {
    // ───── Montage: dựng thẳng bằng montage_engine.py (cắt theo nhịp, nhạc, -14 LUFS) ─────
    report("checking", 1);
    // Kịch bản cũ (trước khi bỏ chữ) có thể còn title → xoá; bản chính 60fps: nguồn ≥50fps thì dựng thẳng 60fps (khung thật)
    const mj = JSON.parse(await fs.readFile(montageFile, "utf8"));
    mj.title = "";
    mj.size = frame.size;
    mj.fps = !draft && options.fps60 && (info.fps ?? 30) >= 50 ? 60 : 30;
    await fs.writeFile(montageFile, JSON.stringify(mj, null, 2), "utf8");
    engineLines = await runPython(python, [path.join(scripts, "montage_engine.py"), "--du-an", proj, ...flag], {
      cwd: scripts,
      signal,
      label: "montage_engine",
      onLine: (l) => {
        const m = l.match(/khung (\d+)\/(\d+)/);
        if (m) report("rendering", Number(m[1]) / Math.max(1, Number(m[2])), `Dựng montage ${draft ? "nháp 720p" : frame.label}`);
      },
    });
    report("mixing", 1, "Đã ghép nhạc");
    produced = path.join(proj, draft ? "montage_nhap720.mp4" : "montage.mp4");
    if (!review) review = JSON.parse(await fs.readFile(path.join(proj, "review.json"), "utf8").catch(() => "null"));
  } else {
  // ───── 4. Dựng hình ─────
  const cutFile = path.join(proj, draft ? "work_draft" : "work", "cut.mov");
  if (!reuse || options.revised) await fs.rm(cutFile, { force: true }); // kịch bản mới / vừa chỉnh → cắt lại từ đầu
  const hookFile = path.join(path.dirname(cutFile), "hook.json");
  await fs.rm(hookFile, { force: true });
  // Có nhạc thật không (sau "chỉnh nhanh" có thể đã tắt nhạc) → khỏi báo "nhạc ngắn hơn video" sai
  const savedPlan = JSON.parse(await fs.readFile(path.join(proj, "plan.json"), "utf8").catch(() => "null"));
  const hasMusic = savedPlan ? savedPlan.duOpts.music.length > 0 : Boolean(options.music?.length);
  engineLines = await runPython(python, [path.join(scripts, "reel_engine.py"), "--du-an", proj, ...flag], {
    cwd: scripts,
    signal,
    label: "reel_engine",
    onLine: (l) => {
      const m = l.match(/khung (\d+)\/(\d+)/);
      if (m) report("rendering", Number(m[1]) / Math.max(1, Number(m[2])), `Dựng hình ${draft ? "nháp 720p" : frame.label}`);
      else if (/^!!/.test(l.trim())) {
        const w = engineWarning(l, { hasMusic });
        if (w) warn(w);
      }
    },
  }).catch(async (err) => {
    // cut.mov dở dang sẽ làm hỏng lần chạy sau (engine thấy file có sẵn là dùng luôn)
    await fs.rm(cutFile, { force: true });
    throw err;
  });
  report("rendering", 1);

  // ───── 5. Âm thanh + xuất file ─────
  const stopMix = timeProgress(report, "mixing", 20 + info.duration * 0.3, "Hiệu ứng âm thanh, nhạc nền, cân -14 LUFS");
  try {
    mixLines = await runPython(python, [path.join(scripts, "mix_engine.py"), "--du-an", proj, ...flag], {
      cwd: scripts,
      signal,
      label: "mix_engine",
      onLine: (l) => {
        if (!/^!!/.test(l.trim())) return;
        const w = engineWarning(l, { hasMusic });
        if (w) warn(w);
      },
    });
  } finally {
    stopMix();
  }

  produced = path.join(proj, draft ? "reel_nhap720.mp4" : "reel.mp4");
  }
  if (!existsSync(produced)) throw new Error("Dựng xong nhưng không thấy file video đầu ra.");
  await fs.mkdir(config.outputDir, { recursive: true });
  const finalPath = path.join(config.outputDir, `${jobId}.mp4`);

  // ───── 5b. Câu móc lên đầu (video voice) + đoạn kết CTA thương hiệu ─────
  const finishInfo = { hook: 0, cta: 0 };
  {
    const hookFile = path.join(proj, draft ? "work_draft" : "work", "hook.json");
    const hook = !isMontage && options.hook !== false && existsSync(hookFile) ? JSON.parse(await fs.readFile(hookFile, "utf8")) : null;
    const cta = options.cta === false ? null : await activeCta();
    if (hook || cta) {
      const msg = [hook && "câu móc lên đầu", cta && "đoạn kết thương hiệu"].filter(Boolean).join(" + ");
      report("mixing", 0.97, `Hoàn thiện: ${msg}`);
      const out = path.join(proj, draft ? "hoan_thien_nhap720.mp4" : "hoan_thien.mp4");
      Object.assign(
        finishInfo,
        await finishVideo({ input: produced, output: out, hook, cta, signal, onProgress: (f) => report("mixing", 0.97 + f * 0.03, `Hoàn thiện: ${msg}`) }),
      );
      produced = out;
    }
  }

  // ───── 6. Nâng 4K / 60fps (tuỳ chọn, chỉ bản chính) ─────
  let resolution = draft ? frame.draftRes : frame.res;
  let outFps = 30;
  if (!draft && options.export4k) {
    const out = await probe(produced);
    const want60 = Boolean(options.fps60);
    outFps = want60 ? 60 : 30;
    let videoIn = produced;
    let share = 0; // phần % dành cho nội suy
    if (want60 && (out.fps ?? 30) < 50) {
      // Bản dựng 30fps → NỘI SUY chuyển động (tạo khung giữa thật, không nhân đôi khung) ở 1080p, chia đoạn chạy song song
      share = 0.85;
      const msg = "Nội suy 60fps (lâu hơn 4K thường)";
      report("upscaling", 0, msg);
      videoIn = await interpolate60(produced, out, path.join(proj, "work_60fps"), {
        signal,
        onProgress: (f) => report("upscaling", f * share, msg),
      });
    }
    const label = want60 ? "Nâng 4K 60fps" : `Nâng lên ${frame.k4.replace("x", "×")}`;
    report("upscaling", share, label);
    const cmd = videoIn === produced ? ffmpeg(produced) : ffmpeg().input(videoIn).inputOptions(["-f", "concat", "-safe", "0"]).input(produced);
    cmd
      .videoFilters(`scale=${frame.k4.replace("x", ":")}:flags=lanczos`)
      .outputOptions([
        ...(videoIn === produced ? [] : ["-map", "0:v:0", "-map", "1:a:0?", "-shortest"]),
        ...videoEncoderOptions({ ...config.edit, encoder: config.edit.videoEncoder, fps: outFps }),
        "-c:a", "copy",
        "-movflags", "+faststart",
      ])
      .output(finalPath);
    await runCommand(cmd, {
      signal,
      expectedDuration: out.duration,
      onProgress: (f) => report("upscaling", share + f * (1 - share), label),
      label: "upscale-4k",
    });
    if (videoIn !== produced) await fs.rm(path.dirname(videoIn), { recursive: true, force: true });
    resolution = frame.k4;
  } else {
    await fs.copyFile(produced, finalPath);
  }

  return {
    outputPath: finalPath,
    review,
    stats: {
      originalDuration: Math.round(info.duration * 100) / 100,
      ...parseStats([...engineLines, ...mixLines]),
      resolution,
      fps: outFps,
      hookSeconds: finishInfo.hook ? Math.round(finishInfo.hook * 10) / 10 : undefined,
      ctaSeconds: finishInfo.cta || undefined,
      encoder: isMontage ? "montage" : "reel-doc-3d",
    },
  };
}
