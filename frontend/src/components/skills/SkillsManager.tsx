"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import {
  fetchSkills,
  installSkill,
  setDefaultSkill,
  skillNeedsSetup,
  skillPreviewUrl,
  updateSkill,
  uploadMusic,
  syncMusic,
  musicLabel,
  type MusicCategory,
} from "@/lib/skills";
import type { Skill } from "@/types/skills";

export function SkillsManager() {
  const [skills, setSkills] = useState<Skill[] | null>(null);
  const [defaultSkill, setDefault] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const d = await fetchSkills();
      setSkills(d.skills);
      setDefault(d.defaultSkill);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
      setSkills([]);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  /** Chạy 1 thao tác, hiện trạng thái bận + thông báo */
  const act = async (key: string, fn: () => Promise<string | void>) => {
    setBusy(key);
    setError(null);
    setNotice(null);
    try {
      const msg = await fn();
      if (msg) setNotice(msg);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-6">
      {error && <p role="alert" className="rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-300">{error}</p>}
      {notice && <p className="rounded-xl border border-accent/20 bg-accent-soft px-4 py-3 text-sm text-zinc-200">{notice}</p>}

      <InstallForm busy={busy === "install"} onInstall={(url) => act("install", async () => {
        const { skill } = await installSkill(url);
        return `Đã cài skill “${skill.name}”.`;
      })} />

      {skills === null ? (
        <div className="h-40 animate-pulse rounded-2xl bg-ink-900/60" />
      ) : skills.length === 0 ? (
        <p className="text-sm text-zinc-500">Chưa có skill nào — dán link GitHub ở trên để cài.</p>
      ) : (
        skills.map((s) => (
          <SkillCard
            key={s.id}
            skill={s}
            busy={busy}
            onSetDefault={() => act(`default:${s.id}`, async () => {
              await setDefaultSkill(s.isDefault ? null : s.id);
              return s.isDefault ? "Đã bỏ mặc định — các lần edit sau dùng bộ cơ bản." : `Từ giờ mọi video sẽ edit bằng “${s.name}”.`;
            })}
            onUpdate={() => act(`update:${s.id}`, async () => {
              const r = await updateSkill(s.id);
              return r.output.includes("Already up to date") ? "Skill đã là bản mới nhất." : `Đã cập nhật: ${r.skill.git?.subject ?? ""}`;
            })}
            onMusic={(file, category) => act(`music:${s.id}`, async () => {
              await uploadMusic(s.id, file, category);
              return `Đã thêm “${file.name}” vào nhạc ${category === "voice" ? "voice thuyết minh" : "chill"}.`;
            })}
            onSyncMusic={() => act(`sync:${s.id}`, async () => {
              const r = await syncMusic(s.id);
              return r.message || "Đã quét lại thư viện nhạc.";
            })}
          />
        ))
      )}

      <div className="flex items-center justify-between rounded-2xl border border-ink-700 px-5 py-4 text-sm">
        <div>
          <p className="text-zinc-200">Bộ edit cơ bản (FFmpeg)</p>
          <p className="text-xs text-zinc-500">Cắt khoảng lặng · phụ đề Whisper · SFX · 4K — dùng khi không chọn skill.</p>
        </div>
        {defaultSkill === null ? (
          <span className="text-xs text-accent">Đang mặc định</span>
        ) : (
          <Button variant="ghost" disabled={busy !== null} onClick={() => act("default:basic", async () => {
            await setDefaultSkill(null);
            return "Các lần edit sau dùng bộ cơ bản.";
          })}>Đặt mặc định</Button>
        )}
      </div>
    </div>
  );
}

function InstallForm({ busy, onInstall }: { busy: boolean; onInstall: (url: string) => void }) {
  const [url, setUrl] = useState("");
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (url.trim()) onInstall(url.trim());
  };
  return (
    <form onSubmit={submit} className="flex flex-col gap-2 sm:flex-row">
      <input
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="https://github.com/<tài khoản>/<repo skill>"
        className="min-w-0 flex-1 rounded-full border border-ink-600 bg-ink-900 px-5 py-3 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-accent focus:outline-none"
      />
      <Button type="submit" disabled={busy || !url.trim()}>{busy ? "Đang cài…" : "Cài skill từ GitHub"}</Button>
    </form>
  );
}

interface SkillCardProps {
  skill: Skill;
  busy: string | null;
  onSetDefault: () => void;
  onUpdate: () => void;
  onMusic: (file: File, category: MusicCategory) => void;
  onSyncMusic: () => void;
}

function SkillCard({ skill: s, busy, onSetDefault, onUpdate, onMusic, onSyncMusic }: SkillCardProps) {
  const [expanded, setExpanded] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploadCat, setUploadCat] = useState<MusicCategory>("chill");
  const cats = s.musicCats ?? { voice: [], chill: [], other: s.music };
  const pick = (cat: MusicCategory) => {
    setUploadCat(cat);
    fileRef.current?.click();
  };
  const check = (ok: boolean, label: string, optional = false) => (
    <li className="flex items-center gap-2">
      <span className={ok ? "text-accent" : optional ? "text-zinc-500" : "text-amber-300"}>{ok ? "✓" : optional ? "○" : "!"}</span>
      <span className={ok ? "text-zinc-300" : "text-zinc-500"}>{label}</span>
    </li>
  );

  return (
    <article className={["overflow-hidden rounded-2xl border bg-ink-900/60", s.isDefault ? "border-accent/40" : "border-ink-700"].join(" ")}>
      <div className="space-y-4 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 text-lg font-medium text-zinc-100">
              {s.name}
              {s.isDefault && <span className="rounded-full bg-accent px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-ink-950">Mặc định</span>}
            </h2>
            {s.git && (
              <p className="mt-0.5 truncate font-mono text-[11px] text-zinc-600">
                {s.git.remote.replace(/^https:\/\/github.com\//, "").replace(/\.git$/, "")} · {s.git.commit} · {new Date(s.git.date).toLocaleDateString("vi-VN")}
              </p>
            )}
          </div>
          <div className="flex shrink-0 gap-2">
            {s.git && <Button variant="ghost" disabled={busy !== null} onClick={onUpdate}>{busy === `update:${s.id}` ? "Đang cập nhật…" : "Cập nhật"}</Button>}
            {s.runnable && (
              <Button variant={s.isDefault ? "ghost" : "primary"} disabled={busy !== null} onClick={onSetDefault}>
                {s.isDefault ? "Bỏ mặc định" : "Dùng cho mọi video"}
              </Button>
            )}
          </div>
        </div>

        <p className={["text-sm leading-relaxed text-zinc-400", expanded ? "" : "line-clamp-3"].join(" ")}>{s.description}</p>
        {s.description.length > 200 && (
          <button type="button" onClick={() => setExpanded((x) => !x)} className="text-xs text-zinc-500 hover:text-zinc-200">
            {expanded ? "Thu gọn" : "Xem thêm"}
          </button>
        )}

        {!s.runnable ? (
          <p className="rounded-lg bg-ink-800 px-3 py-2 text-xs text-zinc-500">
            Đã lưu skill, nhưng web chưa chạy được (không có bộ máy dựng reel_engine.py / mix_engine.py).
          </p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <ul className="space-y-1.5 text-xs">
              {check(s.status.python, "Môi trường Python")}
              {check(Boolean(s.status.phudu), "Font phụ đề DT Phudu (thiếu → Inter Tight)")}
              {check(s.status.fonts, "Font dự phòng Inter Tight")}
              {check(cats.voice.length > 0, `Nhạc voice thuyết minh: ${cats.voice.length} bài`, true)}
              {check(cats.chill.length > 0, `Nhạc chill: ${cats.chill.length} bài`, true)}
            </ul>
            <div className="space-y-2 text-xs">
              {skillNeedsSetup(s) && (
                <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-amber-200/90">
                  Cài môi trường (1 lần): trong thư mục <code>backend</code> chạy <code className="text-amber-100">npm run skill:setup</code>
                </p>
              )}
              <input
                ref={fileRef}
                type="file"
                accept="audio/*,video/mp4,video/quicktime,.mp4,.mov"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (f) onMusic(f, uploadCat);
                }}
              />
              <div className="flex flex-wrap gap-1">
                <Button variant="ghost" disabled={busy !== null || !s.status.python} onClick={() => pick("voice")}>+ Nhạc voice</Button>
                <Button variant="ghost" disabled={busy !== null || !s.status.python} onClick={() => pick("chill")}>+ Nhạc chill</Button>
                <Button variant="ghost" disabled={busy !== null || !s.status.python} onClick={onSyncMusic}>
                  {busy === `sync:${s.id}` ? "Đang quét…" : "Quét lại thư mục"}
                </Button>
              </div>
              {busy === `music:${s.id}` && <p className="text-zinc-400">Đang chuẩn bị nhạc + phân tích nhịp…</p>}
              <p className="text-zinc-600">
                Hoặc thả file thẳng vào <code>skills/{s.id}/nhac/nhac_nen_voice</code> hoặc <code>…/nhac_nen_chill</code> rồi bấm “Quét lại thư mục”
                (web cũng tự quét khi khởi động và trước mỗi lần edit). Bạn tự chịu trách nhiệm bản quyền nhạc.
              </p>
              {cats.chill.length > 0 && (
                <details className="text-zinc-500">
                  <summary className="cursor-pointer hover:text-zinc-300">Xem danh sách nhạc</summary>
                  <p className="mt-1">Voice: {cats.voice.map(musicLabel).join(", ") || "—"}</p>
                  <p>Chill: {cats.chill.map(musicLabel).join(", ")}</p>
                </details>
              )}
            </div>
          </div>
        )}
      </div>

      {s.hasPreview && (
        <details className="border-t border-ink-700">
          <summary className="cursor-pointer px-5 py-3 text-xs text-zinc-500 hover:text-zinc-200">Xem thư viện mẫu B-roll</summary>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={skillPreviewUrl(s.id)} alt={`Thư viện mẫu B-roll của ${s.name}`} className="w-full" loading="lazy" />
        </details>
      )}
    </article>
  );
}
