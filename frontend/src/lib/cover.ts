/**
 * Ảnh bìa: vẽ các dòng chữ lên canvas — CÙNG một hàm cho bản xem trước và bản xuất (2160×3840)
 * → thấy sao xuất vậy. Server chỉ lấy khung hình + ghép lớp chữ PNG này.
 */
import { API_URL } from "./config";
import type { EditJob } from "@/types/edit";

export type FontKind = "vuong" | "cach-dieu";

export interface CoverFont {
  id: string;
  label: string;
  family: string;
  weight: number;
  kind: FontKind;
}

/** Font Google hỗ trợ tiếng Việt. "vuông" = chữ khối đậm; "cách điệu" = chữ viết tay */
export const COVER_FONTS: CoverFont[] = [
  { id: "phudu", label: "DT Phudu", family: "Phudu", weight: 900, kind: "vuong" },
  { id: "anton", label: "Anton", family: "Anton", weight: 400, kind: "vuong" },
  { id: "oswald", label: "Oswald", family: "Oswald", weight: 700, kind: "vuong" },
  { id: "paytone", label: "Paytone One", family: "Paytone One", weight: 400, kind: "vuong" },
  { id: "montserrat", label: "Montserrat Black", family: "Montserrat", weight: 900, kind: "vuong" },
  { id: "bungee", label: "Bungee", family: "Bungee", weight: 400, kind: "vuong" },
  { id: "greatvibes", label: "Great Vibes", family: "Great Vibes", weight: 400, kind: "cach-dieu" },
  { id: "dancing", label: "Dancing Script", family: "Dancing Script", weight: 700, kind: "cach-dieu" },
  { id: "pacifico", label: "Pacifico", family: "Pacifico", weight: 400, kind: "cach-dieu" },
  { id: "lobster", label: "Lobster", family: "Lobster", weight: 400, kind: "cach-dieu" },
];

export const GOOGLE_FONTS_CSS =
  "https://fonts.googleapis.com/css2?family=Phudu:wght@400..900&family=Anton&family=Oswald:wght@500..700" +
  "&family=Paytone+One&family=Montserrat:wght@800;900&family=Bungee&family=Great+Vibes&family=Dancing+Script:wght@600;700" +
  "&family=Pacifico&family=Lobster&display=swap";

export const fontById = (id: string) => COVER_FONTS.find((f) => f.id === id) ?? COVER_FONTS[0];

export interface CoverLayer {
  id: string;
  text: string;
  font: string;
  /** cỡ chữ = tỉ lệ chiều cao khung (0.06 ≈ 115px ở 1080×1920) */
  size: number;
  color: string;
  /** viền: null = không viền; width = tỉ lệ cỡ chữ */
  stroke: string | null;
  strokeWidth: number;
  shadow: boolean;
  /** nền nhãn phía sau chữ (kiểu tag "1 NGÀY") */
  box: string | null;
  upper: boolean;
  /** tâm dòng chữ, 0..1 theo khung */
  x: number;
  y: number;
  rotate: number;
  /** Lớp ẢNH (logo): data URL PNG/JPG — có thì vẽ ảnh thay cho chữ; size = chiều cao ảnh / khung */
  image?: string;
}

export interface CoverDesign {
  layers: CoverLayer[];
  /** làm tối trên/dưới cho chữ nổi (0..1) */
  darken: number;
}

export const ORANGE = "#ff7a1a";
export const SWATCHES = ["#ff7a1a", "#ff9f43", "#ffd23f", "#ffffff", "#111111", "#e8402f", "#2fb24c", "#1e90ff"];

let seq = 0;
export const newId = () => `l${Date.now().toString(36)}${++seq}`;

export function layerOf(kind: FontKind | "nhan", patch: Partial<CoverLayer> = {}): CoverLayer {
  const base: CoverLayer =
    kind === "cach-dieu"
      ? { id: newId(), text: "Hành trình", font: "greatvibes", size: 0.05, color: "#ffffff", stroke: null, strokeWidth: 0, shadow: true, box: null, upper: false, x: 0.5, y: 0.3, rotate: 0 }
      : kind === "nhan"
        ? { id: newId(), text: "1 NGÀY", font: "phudu", size: 0.045, color: "#111111", stroke: null, strokeWidth: 0, shadow: true, box: "#ffd23f", upper: true, x: 0.72, y: 0.5, rotate: -8 }
        : { id: newId(), text: "ĐÀ GIANG", font: "phudu", size: 0.075, color: ORANGE, stroke: "#ffffff", strokeWidth: 0.07, shadow: true, box: null, upper: true, x: 0.5, y: 0.37, rotate: 0 };
  return { ...base, ...patch };
}

/** Mẫu có sẵn (tông cam) */
export const TEMPLATES: { id: string; label: string; make: () => CoverDesign }[] = [
  {
    id: "cach-dieu-vuong",
    label: "Cách điệu + vuông",
    make: () => ({
      darken: 0.35,
      layers: [
        layerOf("cach-dieu", { text: "Hướng dẫn", y: 0.3 }),
        layerOf("vuong", { text: "ĐẶT TOUR ĐÀ GIANG", size: 0.058, y: 0.36 }),
      ],
    }),
  },
  {
    id: "tieu-de-nhan",
    label: "Tiêu đề + nhãn",
    make: () => ({
      darken: 0.35,
      layers: [
        layerOf("vuong", { text: "TOUR TREKKING", size: 0.04, color: "#ffffff", stroke: null, y: 0.2 }),
        layerOf("vuong", { text: "ĐÀ GIANG", size: 0.085, y: 0.27 }),
        layerOf("vuong", { text: "Rừng Nguyên Sinh - Hồ Mắt Ngọc", font: "oswald", size: 0.024, color: "#ffffff", stroke: null, upper: false, y: 0.325 }),
        layerOf("nhan", { y: 0.42 }),
      ],
    }),
  },
  {
    id: "vuong-cach-dieu",
    label: "Vuông + cách điệu",
    make: () => ({
      darken: 0.3,
      layers: [
        layerOf("vuong", { text: "CHECK LIST", size: 0.07, y: 0.2 }),
        layerOf("cach-dieu", { text: "Trekking Đà Giang", size: 0.045, y: 0.255 }),
      ],
    }),
  },
];

export interface LayerBox {
  id: string;
  cx: number;
  cy: number;
  w: number;
  h: number;
  rot: number;
}

const fontCss = (f: CoverFont, px: number) => `${f.weight} ${px}px "${f.family}", "Arial Black", sans-serif`;

const images = new Map<string, HTMLImageElement>();
function imageFor(src: string): HTMLImageElement | null {
  const im = images.get(src);
  return im && im.complete && im.naturalWidth ? im : null;
}

/** Chờ font + ảnh logo tải xong trước khi vẽ (canvas không tự vẽ lại khi font về) */
export async function ensureFonts(layers: CoverLayer[]) {
  if (typeof document === "undefined") return;
  await Promise.all(
    layers.map((l) => {
      if (l.image) {
        let im = images.get(l.image);
        if (!im) {
          im = new Image();
          im.src = l.image;
          images.set(l.image, im);
        }
        return im.decode().catch(() => {});
      }
      const f = fontById(l.font);
      return document.fonts?.load(fontCss(f, 40), l.text || "A").catch(() => []);
    }),
  );
}

/** Đọc file logo → data URL PNG (thu nhỏ tối đa 800px cho nhẹ) */
export async function readLogo(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const im = new Image();
    im.src = url;
    await im.decode();
    const k = Math.min(1, 800 / Math.max(im.naturalWidth, im.naturalHeight));
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(im.naturalWidth * k));
    c.height = Math.max(1, Math.round(im.naturalHeight * k));
    c.getContext("2d")!.drawImage(im, 0, 0, c.width, c.height);
    return c.toDataURL("image/png");
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function logoLayer(src: string, patch: Partial<CoverLayer> = {}): CoverLayer {
  return { ...layerOf("vuong"), text: "Logo", image: src, size: 0.09, color: "#ffffff", stroke: null, strokeWidth: 0, shadow: false, box: null, upper: false, y: 0.12, ...patch };
}

/**
 * Vẽ thiết kế lên canvas W×H. Trả về khung bao từng dòng (để kéo thả).
 * selected: vẽ khung chọn (chỉ khi xem trước).
 */
export function drawCover(ctx: CanvasRenderingContext2D, design: CoverDesign, W: number, H: number, selected?: string | null): LayerBox[] {
  ctx.clearRect(0, 0, W, H);
  if (design.darken > 0) {
    const a = Math.min(0.85, design.darken);
    const top = ctx.createLinearGradient(0, 0, 0, H * 0.5);
    top.addColorStop(0, `rgba(0,0,0,${a})`);
    top.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = top;
    ctx.fillRect(0, 0, W, H * 0.5);
    const bot = ctx.createLinearGradient(0, H * 0.6, 0, H);
    bot.addColorStop(0, "rgba(0,0,0,0)");
    bot.addColorStop(1, `rgba(0,0,0,${a * 0.8})`);
    ctx.fillStyle = bot;
    ctx.fillRect(0, H * 0.6, W, H * 0.4);
  }

  const boxes: LayerBox[] = [];
  for (const l of design.layers) {
    if (l.image) {
      const im = imageFor(l.image);
      const ih = l.size * H;
      const iw = im ? (ih * im.naturalWidth) / im.naturalHeight : ih;
      ctx.save();
      ctx.translate(l.x * W, l.y * H);
      ctx.rotate((l.rotate * Math.PI) / 180);
      if (im) {
        if (l.shadow) setShadow(ctx, ih * 0.5);
        ctx.drawImage(im, -iw / 2, -ih / 2, iw, ih);
      }
      const box: LayerBox = { id: l.id, cx: l.x * W, cy: l.y * H, w: iw, h: ih, rot: (l.rotate * Math.PI) / 180 };
      boxes.push(box);
      if (selected === l.id) {
        ctx.shadowColor = "transparent";
        ctx.setLineDash([Math.max(4, W * 0.012), Math.max(3, W * 0.008)]);
        ctx.strokeStyle = "rgba(198,255,61,0.95)";
        ctx.lineWidth = Math.max(1.5, W * 0.004);
        ctx.strokeRect(-iw / 2, -ih / 2, iw, ih);
      }
      ctx.restore();
      continue;
    }
    const f = fontById(l.font);
    const px = l.size * H;
    const text = l.upper ? l.text.toLocaleUpperCase("vi") : l.text;
    const lines = text.split("\n");
    const script = f.kind === "cach-dieu";
    const lh = px * (script ? 1.25 : 1.08);
    ctx.save();
    ctx.translate(l.x * W, l.y * H);
    ctx.rotate((l.rotate * Math.PI) / 180);
    ctx.font = fontCss(f, px);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineJoin = "round";
    ctx.miterLimit = 2;
    const widths = lines.map((s) => ctx.measureText(s).width);
    const maxW = Math.max(1, ...widths);
    const padX = l.box ? px * 0.35 : px * 0.1;
    const padY = l.box ? px * 0.18 : px * 0.05;
    const totalH = lh * lines.length;
    // Dòng quá dài so với khung → tự thu nhỏ cho vừa (không tràn mép)
    const strokeExtra = l.stroke ? l.strokeWidth * px * 2 : 0;
    const fit = Math.min(1, (W * 0.94) / (maxW + padX * 2 + strokeExtra));
    ctx.scale(fit, fit);

    lines.forEach((line, i) => {
      const ly = (i - (lines.length - 1) / 2) * lh;
      const yText = ly + px * (script ? 0.02 : 0.06); // bù đường cơ sở cho chữ hoa nhìn cân giữa
      if (l.box) {
        ctx.save();
        if (l.shadow) setShadow(ctx, px);
        ctx.fillStyle = l.box;
        roundRect(ctx, -widths[i] / 2 - padX, ly - px * 0.55 - padY / 2, widths[i] + padX * 2, px * 1.1 + padY, px * 0.16);
        ctx.fill();
        ctx.restore();
      }
      const shadowOnText = l.shadow && !l.box;
      if (l.stroke && l.strokeWidth > 0) {
        ctx.save();
        if (shadowOnText) setShadow(ctx, px);
        ctx.strokeStyle = l.stroke;
        ctx.lineWidth = l.strokeWidth * px * 2;
        ctx.strokeText(line, 0, yText);
        ctx.restore();
        ctx.fillStyle = l.color;
        ctx.fillText(line, 0, yText);
      } else {
        ctx.save();
        if (shadowOnText) setShadow(ctx, px);
        ctx.fillStyle = l.color;
        ctx.fillText(line, 0, yText);
        ctx.restore();
      }
    });

    const bw = maxW + padX * 2 + strokeExtra;
    const bh = totalH + padY * 2;
    const box: LayerBox = { id: l.id, cx: l.x * W, cy: l.y * H, w: bw * fit, h: bh * fit, rot: (l.rotate * Math.PI) / 180 };
    boxes.push(box);
    if (selected === l.id) {
      ctx.setLineDash([Math.max(4, W * 0.012), Math.max(3, W * 0.008)]);
      ctx.strokeStyle = "rgba(198,255,61,0.95)";
      ctx.lineWidth = Math.max(1.5, W * 0.004);
      ctx.strokeRect(-bw / 2, -bh / 2, bw, bh);
    }
    ctx.restore();
  }
  return boxes;
}

function setShadow(ctx: CanvasRenderingContext2D, px: number) {
  ctx.shadowColor = "rgba(0,0,0,0.6)";
  ctx.shadowBlur = px * 0.22;
  ctx.shadowOffsetY = px * 0.06;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Điểm (px,py) nằm trong dòng nào (ưu tiên dòng vẽ sau = nằm trên) */
export function hitTest(boxes: LayerBox[], px: number, py: number): LayerBox | null {
  for (let i = boxes.length - 1; i >= 0; i--) {
    const b = boxes[i];
    const dx = px - b.cx, dy = py - b.cy;
    const c = Math.cos(-b.rot), s = Math.sin(-b.rot);
    const lx = dx * c - dy * s, ly = dx * s + dy * c;
    if (Math.abs(lx) <= b.w / 2 && Math.abs(ly) <= b.h / 2) return b;
  }
  return null;
}

/** Xuất lớp chữ PNG trong suốt 2160×3840 (server thu nhỏ theo video) */
export async function renderOverlay(design: CoverDesign, opts: { darkenBackground?: boolean; landscape?: boolean } = {}): Promise<Blob> {
  await ensureFonts(design.layers);
  const c = document.createElement("canvas");
  c.width = opts.landscape ? 3840 : 2160; // video ngang → bìa ngang 16:9
  c.height = opts.landscape ? 2160 : 3840;
  drawCover(c.getContext("2d")!, opts.darkenBackground === false ? { ...design, darken: 0 } : design, c.width, c.height, null);
  return new Promise((ok, fail) => c.toBlob((b) => (b ? ok(b) : fail(new Error("Không xuất được ảnh."))), "image/png"));
}

export type InsertMode = 0 | 0.1 | 1;

export async function uploadCover(jobId: string, overlay: Blob, time: number, insert: InsertMode): Promise<EditJob> {
  const fd = new FormData();
  fd.append("time", time.toFixed(3));
  fd.append("insert", String(insert));
  fd.append("overlay", overlay, "chu.png");
  const res = await fetch(`${API_URL}/api/edit/${jobId}/cover`, { method: "POST", body: fd }).catch(() => {
    throw new Error("Không kết nối được backend.");
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error?.message ?? `Lỗi ${res.status}`);
  return data.job as EditJob;
}

export async function fetchJob(jobId: string): Promise<EditJob> {
  const res = await fetch(`${API_URL}/api/edit/${jobId}`);
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error?.message ?? `Lỗi ${res.status}`);
  return data.job as EditJob;
}

export async function deleteCover(jobId: string): Promise<EditJob> {
  const res = await fetch(`${API_URL}/api/edit/${jobId}/cover`, { method: "DELETE" });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error?.message ?? `Lỗi ${res.status}`);
  return data.job as EditJob;
}

export const coverUrls = (jobId: string, version = 0) => ({
  image: `${API_URL}/api/edit/${jobId}/cover.jpg?v=${version}`,
  imageDownload: `${API_URL}/api/edit/${jobId}/cover.jpg?download=1&v=${version}`,
  videoDownload: `${API_URL}/api/edit/${jobId}/download?cover=1`,
});

const KEY = "va.cover.design.v1";
export function loadSavedDesign(): CoverDesign | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const d = JSON.parse(raw) as CoverDesign;
    return Array.isArray(d.layers) ? d : null;
  } catch {
    return null;
  }
}
export function saveDesign(d: CoverDesign) {
  try {
    localStorage.setItem(KEY, JSON.stringify(d));
  } catch {
    /* trình duyệt chặn lưu → bỏ qua */
  }
}
