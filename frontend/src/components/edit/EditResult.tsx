"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import type { EditJob } from "@/types/edit";
import { CoverEditor } from "@/components/cover/CoverEditor";
import { SuggestPanel } from "./SuggestPanel";
import { ReviseEditor } from "./ReviseEditor";
import { Studio } from "@/components/studio/Studio";
import type { ReviseEdits } from "@/types/edit";
import { QUALITY_OPTIONS, Segmented, fromQuality, qualityOf, type Quality } from "./EditOptions";

interface EditResultProps {
  job: EditJob;
  videoUrl: string;
  downloadUrl: string | null;
  onReset: () => void;
  /** Bản nháp skill: duyệt → dựng bản chính */
  onApprove?: (export4k: boolean, fps60: boolean) => void;
  /** Bản nháp skill: chỉnh nhanh rồi dựng lại */
  onRevise?: (edits: ReviseEdits) => void;
  /** Studio: xuất lại với chữ / hiệu ứng đã sửa */
  onRecompose?: () => void;
}

const fmtSec = (s: number) =>
  s >= 60 ? `${Math.floor(s / 60)}p${String(Math.round(s % 60)).padStart(2, "0")}` : `${s.toFixed(1)}s`;

function statChips(job: EditJob): string[] {
  const s = job.stats;
  if (!s) return [];
  return [
    s.originalDuration && s.outputDuration ? `${fmtSec(s.originalDuration)} → ${fmtSec(s.outputDuration)}` : null,
    s.removedSeconds ? `Bỏ ${fmtSec(s.removedSeconds)} im lặng` : null,
    s.cuts ? `${s.cuts} lần cắt` : null,
    s.speed ? `Tăng tốc ×${s.speed}` : null,
    s.clusters ? `${s.clusters} cụm chữ` : s.captions ? `${s.captions} câu text` : null,
    s.broll ? `${s.broll} B-roll 3D` : null,
    s.shots ? `${s.shots} cảnh theo nhịp` : null,
    s.music ? `♪ ${s.music}${s.bpm ? ` · ${s.bpm} BPM` : ""}` : null,
    s.soundEffects ? `${s.soundEffects} SFX` : null,
    s.loudnessLufs !== undefined ? `${s.loudnessLufs} LUFS` : null,
    s.resolution ? `${s.resolution}${s.fps ? ` · ${s.fps}fps` : ""}` : null,
  ].filter((x): x is string => Boolean(x));
}

export function EditResult({ job, videoUrl, downloadUrl, onReset, onApprove, onRevise, onRecompose }: EditResultProps) {
  const [quality, setQuality] = useState<Quality>(qualityOf(job));
  const [showCover, setShowCover] = useState(Boolean(job.cover));
  const [showRevise, setShowRevise] = useState(false);
  const [studio, setStudio] = useState(false);
  const [coverSeed, setCoverSeed] = useState<{ script: string; block: string; n: number } | null>(null);
  const chips = statChips(job);
  const r = job.review;
  const isDraft = job.pipeline === "skill" && job.mode === "draft";

  return (
    <div className="w-full animate-fade-up space-y-6">
      {isDraft && (
        <p className="text-center text-xs uppercase tracking-[0.15em] text-accent">Bản nháp 720p — xem rồi duyệt để ra bản chính</p>
      )}

      <div className="flex justify-center overflow-hidden rounded-3xl border border-ink-700 bg-black">
        <video src={videoUrl} controls playsInline className="max-h-[70vh] w-full object-contain" />
      </div>

      {chips.length > 0 && (
        <ul className="flex flex-wrap justify-center gap-2">
          {chips.map((c) => (
            <li key={c} className="rounded-full border border-ink-600 bg-ink-800/60 px-3 py-1 font-mono text-[11px] text-zinc-400">
              {c}
            </li>
          ))}
        </ul>
      )}

      {r && (
        <div className="space-y-3 rounded-2xl border border-ink-700 bg-ink-900/60 p-5 text-sm">
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs uppercase tracking-[0.15em] text-zinc-500">Kịch bản edit</span>
            <span className="text-[11px] text-zinc-600">{r.planner === "claude" ? "Claude theo SKILL.md" : "Tự động (chưa có Claude)"}</span>
          </div>
          {r.summary && <p className="text-zinc-300">{r.summary}</p>}
          {(r.hook || r.grade) && (
            <p className="text-xs text-zinc-400">
              {r.hook && (
                <>
                  Câu móc mở đầu: <span className="text-[#ff9f43]">“{r.hook.text}”</span>
                  {r.grade && " · "}
                </>
              )}
              {r.grade && <>Bộ màu: {r.grade}</>}
            </p>
          )}
          {r.mode === "montage" ? (
            <div className="space-y-1 text-xs text-zinc-400">
              <p className="text-zinc-500">
                Video không lời → montage theo nhạc “{r.music}”{r.bpm ? ` (${r.bpm} BPM)` : ""} · {r.shots?.length ?? 0} cảnh
                {r.clips && r.clips > 1 ? ` · từ ${r.clips} clip` : ""}
              </p>
              {r.title && r.mode !== "montage" && <p className="text-zinc-300">Tiêu đề: “{r.title.replace(/\n/g, " / ")}”</p>}
              <ul className="max-h-40 space-y-0.5 overflow-auto">
                {r.shots?.map((sh, i) => (
                  <li key={i}>
                    <span className="font-mono text-zinc-500">#{i + 1} {sh.start.toFixed(1)}s · {sh.beats} nhịp{sh.speed < 1 ? ` · chậm ×${sh.speed}` : ""}</span> {sh.reason}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
          <p className="text-xs text-zinc-500">
            {r.clusters} cụm chữ · ×{r.speed}
            {r.broll.length > 0 && ` · B-roll: ${r.broll.map((b) => b.template.replace(/^B/, "")).join(", ")}`}
            {r.behind.length > 0 && ` · chữ sau đầu: ${r.behind.join(", ")}`}
            {r.dark > 0 && ` · ${r.dark} cụm nền tối`}
          </p>
          )}
          {r.scenes && r.scenes.length > 0 && (
            <div className="text-xs text-zinc-400">
              <p className="mb-1 text-zinc-500">
                Giữ {r.scenes.length} cảnh không lời{r.clips && r.clips > 1 ? ` · ghép từ ${r.clips} clip` : ""}:
              </p>
              <ul className="space-y-0.5">
                {r.scenes.map((sc, i) => (
                  <li key={i}>
                    <span className="font-mono text-zinc-500">{sc.start.toFixed(1)}–{sc.end.toFixed(1)}s</span> {sc.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {r.uncertain.length > 0 && (
            <div className="rounded-xl bg-amber-500/5 px-4 py-3">
              <p className="mb-1 text-xs font-medium text-amber-200/90">Chữ AI phải đoán — kiểm tra trong video:</p>
              <ul className="space-y-0.5 text-xs text-amber-100/70">
                {r.uncertain.map((u, i) => (
                  <li key={i}>
                    nghe thành “{u.heard}” → đoán là <span className="text-amber-100">“{u.guess}”</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {job.pipeline === "skill" && onRecompose && (
        <button
          type="button"
          onClick={() => setStudio(true)}
          className="group flex w-full items-center justify-between rounded-2xl border border-accent/40 bg-gradient-to-r from-accent/10 to-transparent px-5 py-4 text-left transition hover:border-accent"
        >
          <span>
            <span className="block text-sm font-medium text-zinc-100">✎ Mở Studio — sửa từng chữ & hiệu ứng</span>
            <span className="block text-xs text-zinc-400">
              Sửa chữ, màu, cỡ, vị trí, lúc xuất hiện; thêm tiêu đề, icon, thẻ, ảnh minh hoạ — xem ngay trên video
            </span>
          </span>
          <span className="text-lg text-accent transition group-hover:translate-x-0.5">→</span>
        </button>
      )}
      {studio && onRecompose && (
        <Studio
          job={job}
          onClose={() => setStudio(false)}
          onExport={() => {
            setStudio(false);
            onRecompose();
          }}
        />
      )}

      {isDraft && onRevise && (
        <div className="space-y-3">
          <button
            type="button"
            onClick={() => setShowRevise((v) => !v)}
            className="flex w-full items-center justify-between rounded-2xl border border-ink-700 bg-ink-900/60 px-5 py-3 text-left transition hover:border-accent/60"
          >
            <span>
              <span className="block text-sm text-zinc-100">Chỉnh nhanh</span>
              <span className="block text-xs text-zinc-500">Sửa chữ sai, bỏ cảnh, đổi nhạc — dựng lại không cần AI</span>
            </span>
            <span className="text-xs text-accent">{showRevise ? "Thu gọn ▲" : "Mở ▼"}</span>
          </button>
          {showRevise && <ReviseEditor job={job} onRevise={onRevise} />}
        </div>
      )}

      <SuggestPanel
        job={job}
        onUseCoverTitle={(t) => {
          setShowCover(true);
          setCoverSeed((s) => ({ ...t, n: (s?.n ?? 0) + 1 }));
        }}
      />

      <div className="space-y-3">
        <button
          type="button"
          onClick={() => setShowCover((v) => !v)}
          className="flex w-full items-center justify-between rounded-2xl border border-ink-700 bg-ink-900/60 px-5 py-3 text-left transition hover:border-[#ff7a1a]/60"
        >
          <span>
            <span className="block text-sm text-zinc-100">Ảnh bìa video</span>
            <span className="block text-xs text-zinc-500">Chọn khung hình, gõ chữ vuông + cách điệu, xem trực tiếp</span>
          </span>
          <span className="text-xs text-[#ff9f43]">{showCover ? "Thu gọn ▲" : job.cover ? "Sửa bìa ▼" : "Tạo bìa ▼"}</span>
        </button>
        {showCover && <CoverEditor job={job} videoUrl={videoUrl} seed={coverSeed} />}
      </div>

      {job.warnings.length > 0 && (
        <ul className="space-y-1 text-center text-xs text-amber-200/70">
          {job.warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      )}

      <div className="flex flex-col-reverse items-center justify-center gap-3 sm:flex-row">
        <Button variant="ghost" onClick={onReset}>Làm video khác</Button>
        {downloadUrl && (
          <a
            href={downloadUrl}
            className={[
              "inline-flex items-center justify-center gap-2 rounded-full px-6 py-3 text-sm font-medium transition-all",
              isDraft
                ? "border border-ink-600 text-zinc-300 hover:border-zinc-400"
                : "bg-accent text-ink-950 hover:brightness-110 hover:shadow-[0_0_32px_-4px_rgba(198,255,61,0.55)]",
            ].join(" ")}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M12 4v12" />
              <path d="m7 11 5 5 5-5" />
              <path d="M4 20h16" />
            </svg>
            {isDraft ? "Tải bản nháp" : `Tải video${job.stats?.resolution ? ` ${job.stats.resolution}` : ""} (.mp4)`}
          </a>
        )}
        {isDraft && onApprove && (
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Segmented value={quality} onChange={setQuality} options={QUALITY_OPTIONS} />
            <Button
              onClick={() => {
                const q = fromQuality(quality);
                onApprove(q.export4k, q.fps60);
              }}
            >
              Duyệt & dựng bản chính
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
