import { API_URL } from "./config";

export type ItemType = "caption" | "title" | "icon" | "card" | "pill" | "image";
export type LineKind = "lead" | "sub" | "cam" | "hop";
export type FontKey = "phudu" | "inter" | "serif";

export interface CaptionLine {
  text: string;
  kind: LineKind;
  words: { w: string; t: number }[];
}

export interface Item {
  id: string;
  type: ItemType;
  start: number;
  end: number;
  x?: number;
  y?: number;
  scale?: number;
  rotate?: number;
  hidden?: boolean;
  /** người dùng đã sửa → dựng lại không ghi đè */
  edited?: boolean;
  // caption
  lines?: CaptionLine[];
  // title / pill / card
  text?: string;
  sub?: string;
  title?: string;
  icon?: string;
  theme?: string;
  font?: FontKey;
  align?: "center" | "left";
  size?: number;
  color?: string;
  accent?: string;
  w?: number;
  // image
  src?: string;
  radius?: number;
}

export interface TimelineStyle {
  accent: string;
  emphasis: string;
  captionFont: FontKey;
  captionSize: number;
  captionY: number;
  captions: boolean;
}

export interface Timeline {
  version: number;
  duration: number;
  landscape: boolean;
  style: TimelineStyle;
  items: Item[];
  removed?: string[];
}

export interface StudioData {
  timeline: Timeline;
  base: { url: string; width: number; height: number; fps: number; duration: number } | null;
  canCompose: boolean;
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, init);
  } catch {
    throw new Error("Không kết nối được backend.");
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error?.message ?? `Lỗi ${res.status}`);
  return data as T;
}

export const fetchStudio = (jobId: string) => call<StudioData & { success: boolean }>(`/api/edit/${jobId}/timeline`);

export const saveTimeline = (jobId: string, timeline: Timeline) =>
  call<{ timeline: Timeline }>(`/api/edit/${jobId}/timeline`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ timeline }),
  }).then((d) => d.timeline);

export async function uploadAsset(jobId: string, file: File) {
  const fd = new FormData();
  fd.append("image", file);
  return call<{ src: string; url: string }>(`/api/edit/${jobId}/assets`, { method: "POST", body: fd });
}

export const assetUrl = (jobId: string, src: string) => `${API_URL}/api/edit/${jobId}/assets/${src.replace(/^asset:/, "")}`;

/** Font của bản xuất (lấy từ backend) → xem trước giống hệt */
export async function loadStudioFonts() {
  if (typeof document === "undefined") return;
  if (!document.getElementById("studio-fonts")) {
    const st = document.createElement("style");
    st.id = "studio-fonts";
    st.textContent = `
@font-face{font-family:"Phudu";src:url(${API_URL}/api/fonts/Phudu-VF.ttf) format("truetype");font-weight:100 900;font-display:block}
@font-face{font-family:"Inter Tight";src:url(${API_URL}/api/fonts/InterTight-VF.ttf) format("truetype");font-weight:100 900;font-display:block}
@font-face{font-family:"Playfair Display";src:url(${API_URL}/api/fonts/PlayfairDisplay-Italic-VF.ttf) format("truetype");font-style:italic;font-weight:400 900;font-display:block}`;
    document.head.appendChild(st);
  }
  await Promise.all(
    ['800 40px "Phudu"', '800 40px "Inter Tight"', 'italic 600 40px "Playfair Display"'].map((f) => document.fonts.load(f, "Àá").catch(() => [])),
  );
}

let seq = 0;
export const newId = () => `u-${Date.now().toString(36)}${(++seq).toString(36)}`;

/** Phần tử mới tại thời điểm t */
export function newItem(type: ItemType, t: number, landscape: boolean): Item {
  const base = { id: newId(), type, start: Math.max(0, t), end: t + 3, edited: true };
  switch (type) {
    case "title":
      return { ...base, text: "Tiêu đề *nhấn*", sub: "Dòng phụ", x: 0.5, y: landscape ? 0.2 : 0.17 };
    case "icon":
      return { ...base, icon: "check", x: landscape ? 0.86 : 0.8, y: landscape ? 0.35 : 0.42, end: t + 2 };
    case "card":
      return { ...base, title: "Tiêu đề thẻ", sub: "Mô tả ngắn", icon: "star", theme: "navy", x: 0.5, y: landscape ? 0.42 : 0.38, w: landscape ? 0.46 : 0.8 };
    case "pill":
      return { ...base, text: "Câu hỏi gây tò mò...?", theme: "light", x: 0.5, y: landscape ? 0.66 : 0.64 };
    case "image":
      return { ...base, x: landscape ? 0.74 : 0.5, y: landscape ? 0.42 : 0.32, w: landscape ? 0.34 : 0.6, rotate: -3 };
    default:
      return { ...base, lines: [{ text: "Chữ mới", kind: "lead", words: [{ w: "Chữ", t }, { w: "mới", t: t + 0.25 }] }], x: 0.5, end: t + 2 };
  }
}

/** Sửa chữ 1 dòng phụ đề: giữ mốc thời gian nếu số từ không đổi, không thì chia đều trong khoảng cũ */
export function retimeLine(line: CaptionLine, text: string, itemEnd: number): CaptionLine {
  const ws = text.trim().split(/\s+/).filter(Boolean);
  if (!ws.length) return { ...line, text, words: [] };
  if (ws.length === line.words.length) return { ...line, text, words: ws.map((w, i) => ({ w, t: line.words[i].t })) };
  const t0 = line.words[0]?.t ?? 0;
  const t1 = Math.max(t0 + 0.2, Math.min(itemEnd - 0.1, (line.words.at(-1)?.t ?? t0) + 0.3));
  const step = ws.length > 1 ? (t1 - t0) / ws.length : 0;
  return { ...line, text, words: ws.map((w, i) => ({ w, t: Math.round((t0 + i * step) * 1000) / 1000 })) };
}

export const captionText = (it: Item) => (it.lines ?? []).map((l) => l.text).join(" ");

export const fmtTime = (s: number) => {
  const m = Math.floor(s / 60);
  const r = s - m * 60;
  return m ? `${m}:${r.toFixed(1).padStart(4, "0")}` : `${r.toFixed(1)}s`;
};

export const ICON_NAME: Record<string, string> = { check: "Dấu tích", cross: "Dấu X", star: "Ngôi sao", heart: "Trái tim", arrow: "Mũi tên", sparkle: "Lấp lánh", fire: "Ngọn lửa" };

export const TYPE_LABEL: Record<ItemType, string> = {
  caption: "Phụ đề",
  title: "Tiêu đề",
  icon: "Sticker",
  card: "Thẻ thông tin",
  pill: "Thẻ chữ",
  image: "Ảnh",
};

export const itemLabel = (it: Item) =>
  it.type === "caption"
    ? captionText(it)
    : it.type === "card"
      ? it.title ?? ""
      : it.type === "icon"
        ? `Sticker ${ICON_NAME[it.icon ?? ""] ?? it.icon ?? ""}`
        : it.type === "image"
          ? "Ảnh minh hoạ"
          : (it.text ?? "").replace(/\*/g, "");

/** Tách 1 phần tử tại t → 2 phần tử (phụ đề: chia từ theo mốc thời gian) */
export function splitItem(it: Item, t: number): [Item, Item] | null {
  if (t <= it.start + 0.1 || t >= it.end - 0.1) return null;
  const a: Item = { ...it, end: t, edited: true };
  const b: Item = { ...it, id: newId(), start: t, edited: true };
  if (it.type === "caption" && it.lines) {
    const part = (keep: (w: { t: number }) => boolean) =>
      it.lines!
        .map((l) => {
          const words = l.words.filter(keep);
          return { ...l, words, text: words.map((w) => w.w).join(" ") };
        })
        .filter((l) => l.words.length);
    a.lines = part((w) => w.t < t);
    b.lines = part((w) => w.t >= t);
    if (!a.lines.length || !b.lines.length) return null;
  }
  return [a, b];
}

export const fmtClock = (s: number) => {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  const f = Math.floor((s % 1) * 30);
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}:${String(f).padStart(2, "0")}`;
};
