import { API_URL } from "./config";
import type { Skill, SkillsResponse } from "@/types/skills";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, init);
  } catch {
    throw new Error("Không kết nối được tới server. Backend đã chạy chưa?");
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error?.message ?? `Lỗi HTTP ${res.status}`);
  return body as T;
}

const json = (method: string, data: unknown): RequestInit => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(data),
});

export const fetchSkills = () => request<SkillsResponse>("/api/skills");

export const installSkill = (repoUrl: string) =>
  request<{ skill: Skill }>("/api/skills", json("POST", { repoUrl }));

export const updateSkill = (id: string) =>
  request<{ skill: Skill; output: string }>(`/api/skills/${id}/update`, { method: "POST" });

/** null = dùng bộ edit cơ bản cho mọi lần edit */
export const setDefaultSkill = (id: string | null) =>
  request<{ defaultSkill: string | null }>("/api/skills/default", json("PUT", { id }));

export type MusicCategory = "voice" | "chill";

/** Tải nhạc vào thư mục loại tương ứng (nhac_nen_voice / nhac_nen_chill) rồi backend tự chuẩn bị + phân tích nhịp */
export function uploadMusic(id: string, file: File, category: MusicCategory) {
  const form = new FormData();
  form.append("category", category);
  form.append("music", file);
  return request<{ message: string; skill: Skill }>(`/api/skills/${id}/music`, { method: "POST", body: form });
}

/** Quét lại 2 thư mục nhạc (sau khi tự thả file vào bằng Finder) */
export const syncMusic = (id: string) =>
  request<{ message: string; skill: Skill }>(`/api/skills/${id}/music/sync`, { method: "POST" });

/** Tên bài dễ đọc: bỏ tiền tố loại, rút gọn mã dài */
export const musicLabel = (name: string) => {
  const s = name.replace(/^(voice|chill)-/, "");
  return s.length > 22 ? `${s.slice(0, 10)}…${s.slice(-6)}` : s;
};

export const skillPreviewUrl = (id: string) => `${API_URL}/api/skills/${id}/preview`;

/** Skill chạy được nhưng chưa cài đủ môi trường */
export const skillNeedsSetup = (s: Skill) =>
  s.runnable && (!s.status.python || !s.status.fonts || s.status.phudu === false);
