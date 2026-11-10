/**
 * Thương hiệu: tên, SĐT, hashtag mặc định (AI dùng khi viết caption) + ĐOẠN KẾT CTA
 * (lớp chữ/logo PNG 2160×3840 do trình duyệt vẽ — giống trình làm ảnh bìa) tự gắn vào cuối mọi video.
 * Lưu ở data/brand/.
 */
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { config } from "../config.js";

const dir = () => path.join(config.dataDir, "brand");
const file = () => path.join(dir(), "brand.json");
export const ctaOverlayPath = () => path.join(dir(), "cta.png");

const DEFAULT = {
  name: "",
  phone: "",
  hashtags: "",
  cta: { enabled: false, duration: 2, darken: 0.5, design: null },
};

export async function getBrand() {
  try {
    const b = JSON.parse(await fs.readFile(file(), "utf8"));
    return { ...DEFAULT, ...b, cta: { ...DEFAULT.cta, ...(b.cta ?? {}) }, hasCta: existsSync(ctaOverlayPath()) };
  } catch {
    return { ...DEFAULT, hasCta: existsSync(ctaOverlayPath()) };
  }
}

async function write(b) {
  await fs.mkdir(dir(), { recursive: true });
  const { hasCta, ...rest } = b;
  await fs.writeFile(file(), JSON.stringify(rest, null, 2), "utf8");
}

const clean = (v, max) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);

export async function saveBrandInfo({ name, phone, hashtags }) {
  const b = await getBrand();
  if (name !== undefined) b.name = clean(name, 80);
  if (phone !== undefined) b.phone = clean(phone, 40);
  if (hashtags !== undefined) b.hashtags = clean(hashtags, 300);
  await write(b);
  return getBrand();
}

export async function saveCta({ overlayTmp, design, enabled, duration, darken }) {
  const b = await getBrand();
  if (overlayTmp) {
    await fs.mkdir(dir(), { recursive: true });
    await fs.copyFile(overlayTmp, ctaOverlayPath());
    await fs.rm(overlayTmp, { force: true });
  }
  if (design !== undefined) b.cta.design = design;
  if (enabled !== undefined) b.cta.enabled = Boolean(enabled);
  if (duration !== undefined) b.cta.duration = Math.min(4, Math.max(1, Number(duration) || 2));
  if (darken !== undefined) b.cta.darken = Math.min(0.85, Math.max(0, Number(darken) || 0));
  await write(b);
  return getBrand();
}

export async function removeCta() {
  const b = await getBrand();
  b.cta = { ...DEFAULT.cta };
  await fs.rm(ctaOverlayPath(), { force: true });
  await write(b);
  return getBrand();
}

/** CTA đang bật và có lớp chữ → { overlay, duration, darken } ; không thì null */
export async function activeCta() {
  const b = await getBrand();
  if (!b.cta.enabled || !b.hasCta) return null;
  return { overlay: ctaOverlayPath(), duration: b.cta.duration, darken: b.cta.darken };
}
