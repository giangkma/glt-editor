"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { fetchSkills, musicLabel, skillNeedsSetup } from "@/lib/skills";
import type { Skill } from "@/types/skills";
import type { EditOptions as Options } from "@/types/edit";

export type VideoType = "voice" | "chill";

export interface EditChoice {
  style: string; // "basic" | id skill
  /** ① voice thuyết minh | ② chill không lời — bắt buộc chọn khi dùng skill */
  videoType: VideoType | null;
  mode: "draft" | "final";
  export4k: boolean;
  fps60: boolean;
  music: string; // "auto" = tự chọn | "" = không nhạc | tên bài
  transition: "muot" | "manh";
  /** Nâng cấp chất lượng (móc 3s, phụ đề, màu, chống rung, lọc gió, khung theo người, đoạn kết) */
  pro?: ProChoice;
}

export interface ProChoice {
  grade: NonNullable<Options["grade"]>;
  hook: boolean;
  captionStyle: "tung-tu" | "cum";
  denoise: boolean;
  stabilize: boolean;
  reframe: boolean;
  cta: boolean;
}

export const DEFAULT_PRO: ProChoice = {
  grade: "tu-dong",
  hook: true,
  captionStyle: "tung-tu",
  denoise: true,
  stabilize: false,
  reframe: true,
  cta: true,
};

const PRO_KEY = "va.pro.v1";
function loadPro(): ProChoice {
  try {
    const raw = localStorage.getItem(PRO_KEY);
    return raw ? { ...DEFAULT_PRO, ...JSON.parse(raw) } : DEFAULT_PRO;
  } catch {
    return DEFAULT_PRO;
  }
}
function savePro(p: ProChoice) {
  try {
    localStorage.setItem(PRO_KEY, JSON.stringify(p));
  } catch {
    /* bỏ qua */
  }
}

const GRADE_OPTIONS: { v: ProChoice["grade"]; label: string }[] = [
  { v: "tu-dong", label: "Tự động theo cảnh (AI)" },
  { v: "tu-nhien", label: "Tự nhiên" },
  { v: "rung-tuoi", label: "Rừng tươi" },
  { v: "hoang-hon", label: "Hoàng hôn ấm" },
  { v: "dien-anh", label: "Điện ảnh" },
];

interface EditOptionsProps {
  value: EditChoice | null;
  onChange: (v: EditChoice) => void;
}

/** Đã đủ lựa chọn để bắt đầu edit chưa (skill thì phải chọn loại video) */
export const choiceReady = (c: EditChoice | null) => Boolean(c && (c.style === "basic" || c.videoType));

/** Đổi lựa chọn trên giao diện → options gửi lên API */
export function toApiOptions(c: EditChoice): Options {
  if (c.style === "basic") return { style: "basic" };
  return {
    style: c.style,
    videoType: c.videoType ?? undefined,
    mode: c.mode,
    export4k: c.export4k,
    fps60: c.export4k && c.fps60,
    music: c.music === "auto" ? ["auto"] : c.music ? [c.music] : [],
    transition: c.transition,
    ...(c.pro ?? DEFAULT_PRO),
  };
}

export type Quality = "1080" | "4k30" | "4k60";
export const QUALITY_OPTIONS: { v: Quality; label: string }[] = [
  { v: "1080", label: "1080p" },
  { v: "4k30", label: "4K 30fps" },
  { v: "4k60", label: "4K 60fps" },
];
export const qualityOf = (c: { export4k: boolean; fps60?: boolean }): Quality => (!c.export4k ? "1080" : c.fps60 ? "4k60" : "4k30");
export const fromQuality = (q: Quality) => ({ export4k: q !== "1080", fps60: q === "4k60" });

export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { v: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="inline-flex rounded-full border border-ink-600 bg-ink-900 p-0.5">
      {options.map((o) => (
        <button
          key={o.v}
          type="button"
          onClick={() => onChange(o.v)}
          className={[
            "rounded-full px-3 py-1.5 text-xs transition-colors",
            value === o.v ? "bg-zinc-100 text-ink-950" : "text-zinc-400 hover:text-zinc-100",
          ].join(" ")}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

const TYPE_CARDS: { v: VideoType; no: string; title: string; desc: (n: number) => string; icon: string }[] = [
  {
    v: "voice",
    no: "1",
    title: "Video voice thuyết minh",
    icon: "🎙️",
    desc: (n) => `Có lời nói → cắt lặng/câu vấp, phụ đề DT Phudu, giữ cảnh đẹp không lời. Nhạc nền nhỏ dưới giọng từ thư mục voice (${n} bài).`,
  },
  {
    v: "chill",
    no: "2",
    title: "Video chill (không lời)",
    icon: "🌄",
    desc: (n) => `Cảnh quay + nhạc → montage cắt đúng nhịp, AI xem hình tự chọn bài hợp nhất trong thư mục chill (${n} bài), tắt tiếng gốc.`,
  },
];

export function EditOptions({ value, onChange }: EditOptionsProps) {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetchSkills()
      .then((d) => {
        if (!alive) return;
        const runnable = d.skills.filter((s) => s.runnable);
        setSkills(runnable);
        // Lần đầu: chọn skill mặc định đã lưu; loại video để trống → bắt người dùng chọn
        if (!value) {
          const def = runnable.find((s) => s.id === d.defaultSkill);
          onChange({ style: def?.id ?? "basic", videoType: null, mode: "draft", export4k: false, fps60: false, music: "auto", transition: "muot", pro: loadPro() });
        }
      })
      .catch((e) => {
        if (!alive) return;
        setLoadError(e.message);
        if (!value) onChange({ style: "basic", videoType: null, mode: "draft", export4k: false, fps60: false, music: "", transition: "muot", pro: loadPro() });
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!value) return <div className="h-24 animate-pulse rounded-2xl bg-ink-900/60" />;

  const skill = skills.find((s) => s.id === value.style);
  const cats = skill?.musicCats ?? { voice: [], chill: [], other: skill?.music ?? [] };
  const set = (patch: Partial<EditChoice>) => onChange({ ...value, ...patch });
  const list = value.videoType === "voice" ? cats.voice : value.videoType === "chill" ? cats.chill : [];

  return (
    <div className="space-y-4 rounded-2xl border border-ink-700 bg-ink-900/60 p-5">
      {/* ───── Bước chọn loại video (bắt buộc với skill) ───── */}
      {skill && (
        <div className="space-y-2">
          <span className="text-xs uppercase tracking-[0.15em] text-zinc-500">
            Loại video {!value.videoType && <span className="normal-case tracking-normal text-amber-300/90">— chọn 1 trong 2 để bắt đầu</span>}
          </span>
          <div className="grid gap-2 sm:grid-cols-2">
            {TYPE_CARDS.map((t) => {
              const on = value.videoType === t.v;
              return (
                <button
                  key={t.v}
                  type="button"
                  onClick={() => set({ videoType: t.v, music: "auto" })}
                  className={[
                    "flex gap-3 rounded-xl border p-4 text-left transition-colors",
                    on ? "border-accent bg-accent-soft" : "border-ink-600 hover:border-zinc-500",
                  ].join(" ")}
                >
                  <span
                    className={[
                      "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-semibold",
                      on ? "bg-accent text-ink-950" : "bg-ink-700 text-zinc-300",
                    ].join(" ")}
                  >
                    {t.no}
                  </span>
                  <span className="space-y-1">
                    <span className="block text-sm font-medium text-zinc-100">
                      {t.icon} {t.title}
                    </span>
                    <span className="block text-xs leading-relaxed text-zinc-500">{t.desc(t.v === "voice" ? cats.voice.length : cats.chill.length)}</span>
                  </span>
                </button>
              );
            })}
          </div>
          {value.videoType && list.length === 0 && (
            <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-200/90">
              Thư mục nhạc {value.videoType === "voice" ? "nhac_nen_voice" : "nhac_nen_chill"} chưa có bài nào — thêm ở{" "}
              <Link href="/skills" className="underline">trang Skills</Link>.
            </p>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-ink-700 pt-4">
        <span className="text-xs uppercase tracking-[0.15em] text-zinc-500">Phong cách edit</span>
        <Link href="/skills" className="text-xs text-zinc-500 underline-offset-4 hover:text-zinc-200 hover:underline">
          Quản lý skill & nhạc →
        </Link>
      </div>

      <div className="flex flex-wrap gap-2">
        {skills.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => set({ style: s.id, music: "auto" })}
            className={[
              "rounded-xl border px-4 py-2.5 text-left transition-colors",
              value.style === s.id ? "border-accent bg-accent-soft" : "border-ink-600 hover:border-zinc-500",
            ].join(" ")}
          >
            <span className="block text-sm font-medium text-zinc-100">
              {s.name} {s.isDefault && <span className="ml-1 text-[10px] uppercase tracking-wider text-accent">mặc định</span>}
            </span>
            <span className="block text-xs text-zinc-500">Skill · AI xem hình · phụ đề DT Phudu · dọc hoặc ngang theo video</span>
          </button>
        ))}
        <button
          type="button"
          onClick={() => set({ style: "basic" })}
          className={[
            "rounded-xl border px-4 py-2.5 text-left transition-colors",
            value.style === "basic" ? "border-accent bg-accent-soft" : "border-ink-600 hover:border-zinc-500",
          ].join(" ")}
        >
          <span className="block text-sm font-medium text-zinc-100">Cơ bản</span>
          <span className="block text-xs text-zinc-500">Cắt lặng · phụ đề · SFX · 4K</span>
        </button>
      </div>

      {skill && value.videoType && (
        <div className="space-y-3 border-t border-ink-700 pt-4">
          {skillNeedsSetup(skill) && (
            <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-200/90">
              Skill chưa cài môi trường. Trong thư mục <code>backend</code> chạy: <code className="text-amber-100">npm run skill:setup</code>
            </p>
          )}
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <Segmented
              value={value.mode}
              onChange={(mode) => set({ mode })}
              options={[
                { v: "draft", label: "Nháp 720p → duyệt" },
                { v: "final", label: "Xuất luôn bản chính" },
              ]}
            />
            {value.videoType === "voice" && (
              <Segmented
                value={value.transition}
                onChange={(transition) => set({ transition })}
                options={[
                  { v: "muot", label: "Chuyển cảnh mượt" },
                  { v: "manh", label: "Năng động (gốc)" },
                ]}
              />
            )}
            <Segmented
              value={qualityOf(value)}
              onChange={(q) => set(fromQuality(q))}
              options={QUALITY_OPTIONS}
            />
            <label className="flex items-center gap-2 text-xs text-zinc-400">
              Nhạc nền
              <select
                value={value.music}
                onChange={(e) => set({ music: e.target.value })}
                className="max-w-[14rem] rounded-lg border border-ink-600 bg-ink-900 px-2 py-1 text-xs text-zinc-200"
              >
                <option value="auto">
                  {value.videoType === "chill" ? "AI xem hình tự chọn (thư mục chill)" : "Tự động (thư mục voice)"}
                </option>
                {value.videoType === "voice" && <option value="">Không nhạc</option>}
                {list.map((m) => (
                  <option key={m} value={m}>
                    {musicLabel(m)}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
      )}

      {skill && value.videoType && (
        <ProPanel
          value={value.pro ?? DEFAULT_PRO}
          videoType={value.videoType}
          onChange={(pro) => {
            savePro(pro);
            set({ pro });
          }}
        />
      )}

      {loadError && <p className="text-xs text-zinc-600">Không tải được danh sách skill ({loadError}) — dùng bộ cơ bản.</p>}
    </div>
  );
}

/** Nâng cao chất lượng: các tuỳ chọn nhớ cho lần sau */
function ProPanel({ value, videoType, onChange }: { value: ProChoice; videoType: VideoType; onChange: (v: ProChoice) => void }) {
  const set = (p: Partial<ProChoice>) => onChange({ ...value, ...p });
  const voice = videoType === "voice";
  const toggles: { k: keyof ProChoice; label: string; hint: string; show: boolean }[] = [
    { k: "hook", label: voice ? "Câu móc 3 giây đầu" : "Cảnh móc mở đầu", hint: voice ? "AI chép câu gây tò mò nhất lên đầu video" : "AI mở video bằng cảnh “wow” nhất", show: true },
    { k: "denoise", label: "Lọc gió & tiếng ồn", hint: "Giọng nói rõ hơn khi quay ngoài trời", show: voice },
    { k: "stabilize", label: "Chống rung", hint: "Clip quay tay khi đi bộ — xử lý lâu hơn", show: true },
    { k: "reframe", label: "Khung đi theo người", hint: "Ghép clip ngang vào video dọc: khung tự lia theo người (video ngang giữ nguyên ngang)", show: true },
    { k: "cta", label: "Đoạn kết thương hiệu", hint: "Logo + SĐT cuối video (thiết lập ở trang Thương hiệu)", show: true },
  ];
  return (
    <div className="space-y-3 border-t border-ink-700 pt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs uppercase tracking-[0.15em] text-zinc-500">Nâng cao chất lượng</span>
        <Link href="/thuong-hieu" className="text-xs text-zinc-500 underline-offset-4 hover:text-zinc-200 hover:underline">
          Thương hiệu & đoạn kết →
        </Link>
      </div>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <label className="flex items-center gap-2 text-xs text-zinc-400">
          Bộ màu
          <select
            value={value.grade}
            onChange={(e) => set({ grade: e.target.value as ProChoice["grade"] })}
            className="rounded-lg border border-ink-600 bg-ink-900 px-2 py-1 text-xs text-zinc-200"
          >
            {GRADE_OPTIONS.map((g) => (
              <option key={g.v} value={g.v}>{g.label}</option>
            ))}
          </select>
        </label>
        {voice && (
          <Segmented
            value={value.captionStyle}
            onChange={(captionStyle) => set({ captionStyle })}
            options={[
              { v: "tung-tu", label: "Phụ đề từng từ (TikTok)" },
              { v: "cum", label: "Phụ đề theo cụm" },
            ]}
          />
        )}
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {toggles
          .filter((t) => t.show)
          .map((t) => (
            <label key={t.k} className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-ink-700 px-3 py-2 hover:border-ink-600">
              <input
                type="checkbox"
                checked={Boolean(value[t.k])}
                onChange={(e) => set({ [t.k]: e.target.checked } as Partial<ProChoice>)}
                className="mt-0.5 accent-[#c6ff3d]"
              />
              <span>
                <span className="block text-xs text-zinc-200">{t.label}</span>
                <span className="block text-[11px] text-zinc-500">{t.hint}</span>
              </span>
            </label>
          ))}
      </div>
    </div>
  );
}
