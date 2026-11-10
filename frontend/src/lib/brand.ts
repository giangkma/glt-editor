import { API_URL } from "./config";
import type { CoverDesign } from "./cover";

export interface Brand {
  name: string;
  phone: string;
  hashtags: string;
  cta: { enabled: boolean; duration: number; darken: number; design: CoverDesign | null };
  hasCta: boolean;
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

export const fetchBrand = () => call<{ brand: Brand }>("/api/brand").then((d) => d.brand);

export const saveBrandInfo = (b: Pick<Brand, "name" | "phone" | "hashtags">) =>
  call<{ brand: Brand }>("/api/brand", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) }).then((d) => d.brand);

export function saveCta(p: { overlay?: Blob; design: CoverDesign; enabled: boolean; duration: number; darken: number }) {
  const fd = new FormData();
  fd.append("design", JSON.stringify(p.design));
  fd.append("enabled", String(p.enabled));
  fd.append("duration", String(p.duration));
  fd.append("darken", String(p.darken));
  if (p.overlay) fd.append("overlay", p.overlay, "cta.png");
  return call<{ brand: Brand }>("/api/brand/cta", { method: "POST", body: fd }).then((d) => d.brand);
}

export const deleteCta = () => call<{ brand: Brand }>("/api/brand/cta", { method: "DELETE" }).then((d) => d.brand);
