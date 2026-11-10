"use client";

import { useRef, useState } from "react";
import { formatBytes } from "@/lib/format";
import { Button } from "@/components/ui/Button";
import { EditOptions, choiceReady, toApiOptions, type EditChoice } from "@/components/edit/EditOptions";
import type { Clip } from "@/hooks/useMultiUpload";
import type { RemoteVideo } from "@/lib/drive";
import { DriveImport } from "./DriveImport";
import type { EditOptions as ApiOptions } from "@/types/edit";

interface ClipBoardProps {
  clips: Clip[];
  ready: boolean;
  onAdd: (files: File[]) => void;
  onAddRemote: (videos: RemoteVideo[]) => void;
  onRemove: (key: string) => void;
  onMove: (key: string, dir: -1 | 1) => void;
  onRetry: (key: string) => void;
  onReset: () => void;
  onStart: (options: ApiOptions) => void;
}

/** Danh sách clip (thứ tự = thứ tự ghép) + tuỳ chọn edit + nút bắt đầu */
export function ClipBoard({ clips, ready, onAdd, onAddRemote, onRemove, onMove, onRetry, onReset, onStart }: ClipBoardProps) {
  const [choice, setChoice] = useState<EditChoice | null>(null);
  const addRef = useRef<HTMLInputElement>(null);
  const [showDrive, setShowDrive] = useState(false);
  const multi = clips.length > 1;
  const basicBlocked = multi && choice?.style === "basic";

  return (
    <div className="w-full animate-fade-up space-y-6">
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-xs uppercase tracking-[0.15em] text-zinc-500">
            {multi ? `${clips.length} clip — ghép thành 1 reel theo thứ tự này` : "1 clip"}
          </p>
          <div className="flex items-center gap-4">
            <button type="button" onClick={() => setShowDrive((v) => !v)} className="text-xs text-zinc-400 hover:text-accent">
              + Thêm từ Drive
            </button>
            <button type="button" onClick={() => addRef.current?.click()} className="text-xs text-zinc-400 hover:text-accent">
              + Thêm clip
            </button>
          </div>
          <input
            ref={addRef}
            type="file"
            multiple
            accept="video/*,.mp4,.mov,.webm,.mkv,.avi"
            className="hidden"
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []);
              e.target.value = "";
              if (files.length) onAdd(files);
            }}
          />
        </div>

        {showDrive && <DriveImport onImported={onAddRemote} onClose={() => setShowDrive(false)} autoFocus />}

        <ol className="space-y-2">
          {clips.map((c, i) => (
            <li key={c.key} className="flex items-center gap-3 rounded-2xl border border-ink-700 bg-ink-900/60 p-2.5 pr-3">
              <span className="w-5 shrink-0 text-center font-mono text-xs text-zinc-600">{i + 1}</span>
              <video src={c.previewUrl} muted playsInline preload="metadata" className="h-16 w-12 shrink-0 rounded-lg bg-black object-cover" />
              <div className="min-w-0 flex-1 space-y-1.5">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="truncate text-sm text-zinc-100" title={c.name}>
                    {c.source === "drive" && <span className="mr-1.5 rounded bg-white/5 px-1 py-0.5 text-[10px] text-zinc-400">Drive</span>}
                    {c.name}
                  </p>
                  <span className="shrink-0 font-mono text-[11px] text-zinc-500">
                    {c.status === "uploading" ? `${c.progress}%` : c.status === "waiting" ? "chờ tải" : c.status === "done" ? "✓" : ""}
                    {" · "}
                    {formatBytes(c.size)}
                  </span>
                </div>
                {c.status === "error" ? (
                  <p className="text-xs text-red-400">
                    {c.error}{" "}
                    <button type="button" onClick={() => onRetry(c.key)} className="underline hover:text-red-300">thử lại</button>
                  </p>
                ) : (
                  <div className="h-1 overflow-hidden rounded-full bg-ink-700">
                    <div
                      className={["h-full rounded-full transition-[width] duration-200", c.status === "done" ? "bg-accent/60" : "bg-accent"].join(" ")}
                      style={{ width: `${c.status === "done" ? 100 : c.progress}%` }}
                    />
                  </div>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-0.5 text-zinc-500">
                <IconBtn label="Lên" disabled={i === 0} onClick={() => onMove(c.key, -1)}>↑</IconBtn>
                <IconBtn label="Xuống" disabled={i === clips.length - 1} onClick={() => onMove(c.key, 1)}>↓</IconBtn>
                <IconBtn label="Xoá" onClick={() => onRemove(c.key)}>✕</IconBtn>
              </div>
            </li>
          ))}
        </ol>
        {multi && (
          <p className="text-xs text-zinc-600">
            AI sẽ xem hình + nghe lời của tất cả clip, giữ đoạn nói hay và cả cảnh không lời đáng giữ. Video ra khung ngang hay dọc theo đa số clip — video ngang giữ nguyên ngang.
          </p>
        )}
      </div>

      <EditOptions value={choice} onChange={setChoice} />

      {basicBlocked && <p className="text-center text-xs text-amber-200/80">Bộ Cơ bản chỉ edit 1 clip — chọn skill để ghép nhiều clip.</p>}

      <div className="flex flex-col-reverse items-center justify-end gap-2 sm:flex-row">
        <Button variant="ghost" onClick={onReset}>Làm lại từ đầu</Button>
        <Button disabled={!ready || !choiceReady(choice) || basicBlocked} onClick={() => choice && onStart(toApiOptions(choice))}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path d="M12 2l1.9 6.1L20 10l-6.1 1.9L12 18l-1.9-6.1L4 10l6.1-1.9L12 2z" />
          </svg>
          {!ready ? "Đang tải clip lên…" : !choiceReady(choice) ? "Chọn loại video ở trên" : "Bắt đầu Auto-Edit"}
        </Button>
      </div>
    </div>
  );
}

function IconBtn({ label, disabled, onClick, children }: { label: string; disabled?: boolean; onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="flex h-7 w-7 items-center justify-center rounded-full text-sm hover:bg-white/5 hover:text-zinc-100 disabled:opacity-30"
    >
      {children}
    </button>
  );
}
