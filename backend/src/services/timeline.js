/**
 * TIMELINE chữ + hiệu ứng của 1 dự án (projects/<id>/timeline.json) — thứ người dùng sửa trong Studio.
 *   { version, duration, landscape, style:{accent, emphasis, captionFont, captionSize, captionY, captions}, items:[...] }
 * Dựng từ captions.json do reel_engine ghi (chữ + mốc từng từ + hiệu ứng AI gợi ý).
 * Dựng lại (chỉnh nhanh / bản chính) thì GIỮ những gì người dùng đã sửa / thêm.
 */
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

export const DEFAULT_STYLE = {
  accent: "#ff7a1a",
  emphasis: "#ff7a1a",
  captionFont: "phudu",
  captionSize: 1,
  captionY: 0.8,
  captions: true,
};

const POS = {
  doc: { title: { x: 0.5, y: 0.17 }, icon: { x: 0.8, y: 0.42 }, card: { x: 0.5, y: 0.38 }, pill: { x: 0.5, y: 0.64 }, image: { x: 0.5, y: 0.32 } },
  ngang: { title: { x: 0.5, y: 0.2 }, icon: { x: 0.86, y: 0.35 }, card: { x: 0.5, y: 0.42 }, pill: { x: 0.5, y: 0.66 }, image: { x: 0.74, y: 0.42 } },
};

export const timelineFile = (proj) => path.join(proj, "timeline.json");

/** captions.json (engine) → timeline mới */
export function buildTimeline(caps, { landscape = false } = {}) {
  const pos = POS[landscape ? "ngang" : "doc"];
  const items = [];
  for (const c of caps.captions ?? []) {
    items.push({ id: `cap-${c.ci}`, type: "caption", start: c.t0, end: c.t1, x: 0.5, lines: c.lines });
  }
  (caps.overlays ?? []).forEach((o, i) => {
    const { type, start, end, ...rest } = o;
    items.push({ id: `ai-${i}`, type, start, end, ...(pos[type] ?? { x: 0.5, y: 0.4 }), ...(type === "card" ? { w: landscape ? 0.46 : 0.8 } : {}), ...rest });
  });
  return {
    version: 1,
    duration: caps.duration ?? 0,
    landscape,
    style: { ...DEFAULT_STYLE, captionY: landscape ? 0.86 : 0.8 },
    items,
  };
}

/** Giữ chỉnh sửa của người dùng: style, phần tử đã sửa (edited) hoặc tự thêm (u-…), phần tử đã xoá (removed) */
export function mergeTimeline(fresh, prev) {
  if (!prev) return fresh;
  const byId = new Map(prev.items.map((it) => [it.id, it]));
  const removed = new Set(prev.removed ?? []);
  const items = fresh.items
    .filter((it) => !removed.has(it.id))
    .map((it) => {
      const old = byId.get(it.id);
      return old?.edited ? old : it;
    });
  for (const it of prev.items) if (it.id.startsWith("u-")) items.push(it);
  return { ...fresh, style: { ...fresh.style, ...prev.style }, items, removed: [...removed] };
}

export async function readTimeline(proj) {
  try {
    return JSON.parse(await fs.readFile(timelineFile(proj), "utf8"));
  } catch {
    return null;
  }
}

export async function writeTimeline(proj, tl) {
  const tmp = timelineFile(proj) + ".tmp";
  await fs.writeFile(tmp, JSON.stringify(tl, null, 1), "utf8");
  await fs.rename(tmp, timelineFile(proj));
}

/** Sau khi engine dựng: captions.json + timeline cũ → timeline mới (lưu lại) */
export async function refreshTimeline(proj, workDir, { landscape, duration }) {
  const prev = await readTimeline(proj);
  const capsFile = path.join(workDir, "captions.json");
  let fresh;
  if (existsSync(capsFile)) fresh = buildTimeline(JSON.parse(await fs.readFile(capsFile, "utf8")), { landscape });
  else fresh = { version: 1, duration, landscape, style: { ...DEFAULT_STYLE, captionY: landscape ? 0.86 : 0.8 }, items: [] };
  const tl = mergeTimeline(fresh, prev);
  tl.duration = fresh.duration || duration;
  await writeTimeline(proj, tl);
  return tl;
}

/** Kiểm tra + làm sạch timeline người dùng gửi lên */
export function sanitizeTimeline(raw, prev) {
  if (!raw || typeof raw !== "object" || !Array.isArray(raw.items)) throw new Error("Timeline không hợp lệ.");
  const TYPES = new Set(["caption", "title", "icon", "card", "pill", "image"]);
  const num = (v, d, a = -1e6, b = 1e6) => (Number.isFinite(Number(v)) ? Math.min(b, Math.max(a, Number(v))) : d);
  const str = (v, n = 300) => (typeof v === "string" ? v.slice(0, n) : undefined);
  const color = (v) => (typeof v === "string" && /^#[0-9a-fA-F]{3,8}$/.test(v) ? v : undefined);
  const dur = prev?.duration ?? 600;
  const items = raw.items.slice(0, 400).filter((it) => it && TYPES.has(it.type) && typeof it.id === "string").map((it) => {
    const o = {
      id: it.id.slice(0, 40),
      type: it.type,
      start: num(it.start, 0, 0, dur),
      end: num(it.end, 1, 0, dur + 5),

      scale: num(it.scale, 1, 0.2, 5),
      rotate: num(it.rotate, 0, -180, 180),
      hidden: Boolean(it.hidden),
      edited: Boolean(it.edited),
    };
    if (o.end < o.start + 0.1) o.end = o.start + 0.1;
    // vị trí: chỉ ghi khi có (không có → bộ vẽ dùng vị trí mặc định, vd phụ đề theo "Vị trí phụ đề")
    if (Number.isFinite(Number(it.x))) o.x = num(it.x, 0.5, -0.5, 1.5);
    if (Number.isFinite(Number(it.y))) o.y = num(it.y, 0.5, -0.5, 1.5);
    for (const k of ["text", "sub", "title", "icon", "theme", "font", "align", "src"]) if (str(it[k]) !== undefined) o[k] = str(it[k]);
    for (const k of ["color", "accent", "iconColor", "subColor"]) if (color(it[k])) o[k] = color(it[k]);
    for (const k of ["size", "w", "radius", "border"]) if (it[k] !== undefined) o[k] = num(it[k], undefined, 0, 2000);
    if (it.type === "caption") {
      o.lines = (Array.isArray(it.lines) ? it.lines : []).slice(0, 6).map((l) => ({
        text: str(l?.text, 120) ?? "",
        kind: ["lead", "sub", "cam", "hop"].includes(l?.kind) ? l.kind : "lead",
        words: (Array.isArray(l?.words) ? l.words : []).slice(0, 30).map((w) => ({ w: str(w?.w, 40) ?? "", t: num(w?.t, o.start, 0, dur + 5) })),
      }));
    }
    if (it.type === "image" && o.src && !/^asset:[\w.-]+$/.test(o.src)) delete o.src;
    return o;
  });
  const st = raw.style ?? {};
  return {
    version: 1,
    duration: dur,
    landscape: Boolean(prev?.landscape ?? raw.landscape),
    style: {
      accent: color(st.accent) ?? DEFAULT_STYLE.accent,
      emphasis: color(st.emphasis) ?? DEFAULT_STYLE.emphasis,
      captionFont: ["phudu", "inter", "serif"].includes(st.captionFont) ? st.captionFont : "phudu",
      captionSize: num(st.captionSize, 1, 0.5, 2),
      captionY: num(st.captionY, 0.8, 0.1, 0.98),
      captions: st.captions !== false,
    },
    items,
    removed: Array.isArray(raw.removed) ? raw.removed.filter((x) => typeof x === "string").slice(0, 400) : [],
  };
}
