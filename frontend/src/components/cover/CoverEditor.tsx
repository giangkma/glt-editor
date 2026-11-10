"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Segmented } from "@/components/edit/EditOptions";
import {
  TEMPLATES,
  coverUrls,
  deleteCover,
  fetchJob,
  fontById,
  loadSavedDesign,
  renderOverlay,
  saveDesign,
  uploadCover,
  type CoverDesign,
  type CoverLayer,
  type InsertMode,
} from "@/lib/cover";
import type { EditCover, EditJob } from "@/types/edit";
import { DesignCanvas } from "./DesignCanvas";
import { DesignControls, Label, SmallBtn } from "./DesignControls";

interface CoverEditorProps {
  job: EditJob;
  /** video để chọn khung (bản nháp hoặc bản chính) */
  videoUrl: string;
  /** chữ AI gợi ý → điền vào dòng cách điệu + dòng chữ vuông (n đổi = điền lại) */
  seed?: { script: string; block: string; n: number } | null;
}

const INSERT_OPTIONS: { v: string; label: string }[] = [
  { v: "0.1", label: "Chèn khung đầu" },
  { v: "1", label: "Hiện bìa 1 giây" },
  { v: "0", label: "Chỉ ảnh bìa" },
];
const INSERT_HINT: Record<string, string> = {
  "0.1": "Bìa thành khung hình đầu tiên (0,1s, gần như không thấy khi xem) → TikTok tự lấy làm ảnh bìa.",
  "1": "Bìa hiện 1 giây đầu video rồi mới vào cảnh.",
  "0": "Chỉ xuất ảnh .jpg — tự tải lên khi đăng (TikTok: Chọn bìa → Tải lên).",
};

/** Trình làm ảnh bìa: chọn khung hình + gõ chữ, xem trực tiếp trên khung 9:16 */
export function CoverEditor({ job, videoUrl, seed }: CoverEditorProps) {
  const [design, setDesign] = useState<CoverDesign>(() => loadSavedDesign() ?? TEMPLATES[0].make());
  const [selected, setSelected] = useState<string | null>(() => design.layers.at(-1)?.id ?? null);
  const [time, setTime] = useState(job.cover?.time ?? 0);
  const [duration, setDuration] = useState(0);
  const [insert, setInsert] = useState<string>(String(job.cover?.insert ?? 0.1));
  const [cover, setCover] = useState<EditCover | null>(job.cover ?? null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  // Video ngang → bìa ngang 16:9 (theo khung thật của video)
  const [landscape, setLandscape] = useState(() => {
    const [w, h] = (job.stats?.resolution ?? "").split("x").map(Number);
    return w > h;
  });
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => saveDesign(design), [design]);

  // Chữ AI gợi ý → giữ nguyên kiểu dáng đang có, chỉ thay nội dung
  useEffect(() => {
    if (!seed) return;
    setDesign((d) => {
      const kind = (l: CoverLayer) => (l.image ? "logo" : fontById(l.font).kind);
      const base = d.layers.some((l) => kind(l) === "cach-dieu") && d.layers.some((l) => kind(l) === "vuong") ? d : TEMPLATES[0].make();
      let doneScript = false;
      let doneBlock = false;
      const layers = base.layers.map((l) => {
        if (!doneScript && kind(l) === "cach-dieu" && !l.box) {
          doneScript = true;
          return { ...l, text: seed.script };
        }
        if (!doneBlock && kind(l) === "vuong" && !l.box) {
          doneBlock = true;
          return { ...l, text: seed.block };
        }
        return l;
      });
      return { ...base, layers };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seed?.n]);

  // Theo dõi tiến trình tạo bìa
  useEffect(() => {
    if (cover?.status !== "working") return;
    const t = setInterval(async () => {
      try {
        const j = await fetchJob(job.id);
        setCover(j.cover ?? null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Mất kết nối backend.");
      }
    }, 1000);
    return () => clearInterval(t);
  }, [cover?.status, job.id]);

  const seek = (t: number) => {
    const clamped = Math.max(0, Math.min(t, duration || t));
    setTime(clamped);
    if (videoRef.current) videoRef.current.currentTime = clamped;
  };

  const submit = async () => {
    setError(null);
    setSending(true);
    try {
      const blob = await renderOverlay(design, { landscape });
      const j = await uploadCover(job.id, blob, time, Number(insert) as InsertMode);
      setCover(j.cover ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không tạo được ảnh bìa.");
    } finally {
      setSending(false);
    }
  };

  const remove = async () => {
    try {
      const j = await deleteCover(job.id);
      setCover(j.cover ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không xoá được.");
    }
  };

  const urls = coverUrls(job.id, cover?.version ?? 0);
  const working = sending || cover?.status === "working";
  const isDraft = job.pipeline === "skill" && job.mode === "draft";
  const step = 1 / 30;

  return (
    <div
      className={[
        "grid gap-6 rounded-2xl border border-ink-700 bg-ink-900/60 p-4 sm:p-5",
        landscape ? "" : "md:grid-cols-[minmax(0,300px)_1fr]",
      ].join(" ")}
    >
      {/* ── Xem trước + chọn khung ── */}
      <div className={["mx-auto w-full space-y-3", landscape ? "max-w-[560px]" : "max-w-[300px]"].join(" ")}>
        <DesignCanvas
          landscape={landscape}
          design={design}
          selected={selected}
          onSelect={setSelected}
          onMove={(id, p) => setDesign((d) => ({ ...d, layers: d.layers.map((l) => (l.id === id ? { ...l, ...p } : l)) }))}
        >
          <video
            ref={videoRef}
            src={videoUrl}
            muted
            playsInline
            preload="auto"
            className="absolute inset-0 h-full w-full object-cover"
            onLoadedMetadata={(e) => {
              setDuration(e.currentTarget.duration || 0);
              setLandscape(e.currentTarget.videoWidth > e.currentTarget.videoHeight);
              e.currentTarget.currentTime = time;
            }}
          />
        </DesignCanvas>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[11px] text-zinc-500">
            <span>Khung làm bìa</span>
            <span className="font-mono text-zinc-300">{time.toFixed(2)}s</span>
          </div>
          <input
            type="range"
            min={0}
            max={Math.max(0.01, duration)}
            step={0.01}
            value={time}
            onChange={(e) => seek(Number(e.target.value))}
            className="w-full accent-[#ff7a1a]"
            aria-label="Chọn khung hình làm bìa"
          />
          <div className="flex justify-center gap-1">
            <SmallBtn onClick={() => seek(time - 1)}>−1s</SmallBtn>
            <SmallBtn onClick={() => seek(time - step)}>◀ khung</SmallBtn>
            <SmallBtn onClick={() => seek(time + step)}>khung ▶</SmallBtn>
            <SmallBtn onClick={() => seek(time + 1)}>+1s</SmallBtn>
          </div>
        </div>
        <p className="text-center text-[11px] text-zinc-600">Kéo chữ / logo trên khung để đặt vị trí</p>
      </div>

      <div className="min-w-0 space-y-4">
        <DesignControls design={design} onChange={setDesign} selected={selected} onSelect={setSelected} templates={TEMPLATES} />

        <div className="space-y-2 border-t border-ink-700 pt-4">
          <Label>Đưa bìa vào video</Label>
          <Segmented value={insert} onChange={setInsert} options={INSERT_OPTIONS} />
          <p className="text-[11px] text-zinc-500">{INSERT_HINT[insert]}</p>
          {isDraft && <p className="text-[11px] text-[#ff9f43]">Đây là bản nháp: bìa lưu lại và tự chèn vào bản chính khi bạn duyệt.</p>}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button disabled={working || design.layers.length === 0} onClick={submit}>
            {working ? (cover?.status === "working" && cover.progress > 0 ? `Đang chèn bìa ${cover.progress}%` : "Đang tạo bìa…") : cover ? "Cập nhật ảnh bìa" : "Tạo ảnh bìa"}
          </Button>
          {error && <p className="text-xs text-red-400">{error}</p>}
          {cover?.status === "error" && <p className="text-xs text-red-400">{cover.error}</p>}
        </div>

        {cover?.status === "done" && (
          <div className="flex gap-4 rounded-xl border border-ink-700 bg-black/20 p-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={urls.image} alt="Ảnh bìa" className="aspect-[9/16] w-24 shrink-0 rounded-lg object-cover" />
            <div className="min-w-0 space-y-2 text-xs">
              <p className="text-zinc-300">
                Ảnh bìa tại {cover.time.toFixed(2)}s{cover.pendingFinal ? " — sẽ chèn vào bản chính khi duyệt" : ""}
              </p>
              <div className="flex flex-wrap gap-2">
                <a href={urls.imageDownload} className="rounded-full border border-ink-600 px-3 py-1.5 text-zinc-200 hover:border-[#ff7a1a]">Tải ảnh bìa (.jpg)</a>
                {cover.hasVideo && (
                  <a href={urls.videoDownload} className="rounded-full bg-[#ff7a1a] px-3 py-1.5 font-medium text-black hover:brightness-110">Tải video có bìa</a>
                )}
                <button type="button" onClick={remove} className="px-2 py-1.5 text-zinc-500 hover:text-red-300">Bỏ bìa</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
