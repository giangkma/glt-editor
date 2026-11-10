/**
 * CHỈNH NHANH sau khi xem nháp — không gọi lại AI, không gỡ băng lại:
 *  - Video voice: sửa chữ phụ đề (giữ đúng số từ gốc bằng "chữ|n"), bỏ cảnh không lời, đổi / tắt nhạc, tắt câu móc.
 *  - Montage chill: bỏ cảnh, đổi bài nhạc (cảnh tự khớp nhịp bài mới).
 * Sửa file trong thư mục dự án rồi dựng lại bản nháp.
 */
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { AppError } from "../../utils/AppError.js";
import { buildDuAnPy, lineWordCount } from "./planner.js";
import { musicCategories, skillDir } from "./registry.js";
import { projectDir } from "./reelPipeline.js";

const readJson = async (p, fallback = null) => JSON.parse(await fs.readFile(p, "utf8").catch(() => JSON.stringify(fallback)));

/** Tách 1 dòng MANUAL thành phần người dùng sửa được: dấu nhấn + chữ hiển thị + số từ gốc */
function splitLine(raw) {
  const mark = raw[0] === "*" || raw[0] === "!" ? raw[0] : "";
  const { n, txt } = lineWordCount(raw);
  return { mark, text: txt.trim(), n };
}

/** Kịch bản có thể chỉnh của 1 bản nháp skill */
export async function getScript(job) {
  if (job.pipeline !== "skill") throw new AppError("Chỉ chỉnh nhanh được video dựng bằng skill.", 409, "NOT_SKILL");
  const proj = projectDir(job._options.projectId);
  const cats = await musicCategories(skillDir(job.skillId));
  if (existsSync(path.join(proj, "montage.json"))) {
    const m = await readJson(path.join(proj, "montage.json"));
    return { mode: "montage", music: m.music, musicOptions: cats.chill.length ? cats.chill : [...cats.chill, ...cats.other], shots: m.shots };
  }
  const saved = await readJson(path.join(proj, "plan.json"));
  if (!saved) throw new AppError("Bản nháp này dựng trước khi có chỉnh nhanh — hãy edit lại 1 lần.", 409, "NO_PLAN");
  const { plan, duOpts } = saved;
  return {
    mode: "voice",
    music: duOpts.music?.[0] ?? "",
    musicOptions: cats.voice.length ? cats.voice : [...cats.voice, ...cats.other],
    hook: duOpts.hook && plan.hook ? plan.hook : null,
    clusters: plan.manual.map((c) => c.map((raw) => ({ ...splitLine(raw), emphasis: raw[0] === "*" ? "cam" : raw[0] === "!" ? "hop" : "" }))),
    scenes: plan.scenes ?? [],
  };
}

/**
 * @param {object} edits
 *   voice:   { lines?: {[ "ci.li" ]: "chữ mới"}, removeScenes?: number[], music?: string, hook?: boolean }
 *   montage: { removeShots?: number[], music?: string }
 * @returns {Promise<string[]>} mô tả thay đổi
 */
export async function applyRevision(job, edits = {}) {
  const proj = projectDir(job._options.projectId);
  const cats = await musicCategories(skillDir(job.skillId));
  const allMusic = new Set([...cats.voice, ...cats.chill, ...cats.other]);
  const changes = [];

  if (existsSync(path.join(proj, "montage.json"))) {
    const file = path.join(proj, "montage.json");
    const m = await readJson(file);
    const rm = new Set((edits.removeShots ?? []).map(Number));
    if (rm.size) {
      const shots = m.shots.filter((_, i) => !rm.has(i));
      if (shots.length < 2) throw new AppError("Montage cần giữ ít nhất 2 cảnh.", 400, "TOO_FEW_SHOTS");
      m.shots = shots;
      changes.push(`bỏ ${rm.size} cảnh`);
    }
    if (edits.music && edits.music !== m.music) {
      if (!allMusic.has(edits.music)) throw new AppError(`Không có bài "${edits.music}".`, 400, "INVALID_OPTION");
      m.music = edits.music;
      m.start_beat = 0;
      changes.push(`đổi nhạc → ${edits.music}`);
    }
    if (!changes.length) throw new AppError("Chưa có thay đổi nào.", 400, "NO_CHANGES");
    await fs.writeFile(file, JSON.stringify(m, null, 2), "utf8");
    const review = await readJson(path.join(proj, "review.json"), {});
    Object.assign(review, { shots: m.shots, music: m.music, bpm: null });
    await fs.writeFile(path.join(proj, "review.json"), JSON.stringify(review, null, 2), "utf8");
    return changes;
  }

  const saved = await readJson(path.join(proj, "plan.json"));
  if (!saved) throw new AppError("Không có kịch bản để chỉnh.", 409, "NO_PLAN");
  const { plan, duOpts } = saved;

  // Sửa chữ: giữ dấu nhấn, giữ đúng số từ gốc (thêm "|n" khi số từ thay đổi)
  let fixed = 0;
  for (const [key, value] of Object.entries(edits.lines ?? {})) {
    const [ci, li] = key.split(".").map(Number);
    const raw = plan.manual[ci]?.[li];
    if (raw === undefined) continue;
    const { mark, text, n } = splitLine(raw);
    const next = String(value ?? "").replace(/[|*!]/g, "").replace(/\s+/g, " ").trim();
    if (!next || next === text) continue;
    const cnt = next.split(" ").length;
    plan.manual[ci][li] = `${mark}${next}${cnt === n ? "" : `|${n}`}`;
    fixed++;
  }
  if (fixed) changes.push(`sửa ${fixed} dòng chữ`);

  const rmScenes = new Set((edits.removeScenes ?? []).map(Number));
  if (rmScenes.size) {
    plan.scenes = (plan.scenes ?? []).filter((_, i) => !rmScenes.has(i));
    if (!plan.wranges.length && !plan.scenes.length) throw new AppError("Không thể bỏ hết mọi cảnh.", 400, "NOTHING_LEFT");
    changes.push(`bỏ ${rmScenes.size} cảnh không lời`);
  }
  if (edits.music !== undefined && (duOpts.music?.[0] ?? "") !== edits.music) {
    if (edits.music && !allMusic.has(edits.music)) throw new AppError(`Không có bài "${edits.music}".`, 400, "INVALID_OPTION");
    duOpts.music = edits.music ? [edits.music] : [];
    changes.push(edits.music ? `đổi nhạc → ${edits.music}` : "tắt nhạc nền");
  }
  if (edits.hook === false && duOpts.hook) {
    duOpts.hook = false;
    changes.push("bỏ câu móc");
  }
  if (!changes.length) throw new AppError("Chưa có thay đổi nào.", 400, "NO_CHANGES");

  await fs.writeFile(path.join(proj, "du_an.py"), buildDuAnPy(plan, duOpts), "utf8");
  await fs.writeFile(path.join(proj, "plan.json"), JSON.stringify({ plan, duOpts }, null, 2), "utf8");
  const review = await readJson(path.join(proj, "review.json"), {});
  Object.assign(review, { scenes: plan.scenes, ...(duOpts.hook ? {} : { hook: null }) });
  await fs.writeFile(path.join(proj, "review.json"), JSON.stringify(review, null, 2), "utf8");
  return changes;
}
