"use client";

import { useEffect, useRef, useState } from "react";
import { formatBytes } from "@/lib/format";
import { Button } from "@/components/ui/Button";
import {
  cancelImport,
  looksLikeDrive,
  startDriveImport,
  subscribeImport,
  type ImportSession,
  type RemoteVideo,
} from "@/lib/drive";

interface DriveImportProps {
  /** Video đã tải xong về server → thêm vào danh sách clip (giữ nguyên luồng edit cũ) */
  onImported: (videos: RemoteVideo[]) => void;
  onClose?: () => void;
  autoFocus?: boolean;
}

/**
 * Dán 1 hoặc nhiều link Google Drive (file hoặc thư mục) → server tự nhận biết,
 * tải video về, rồi đưa vào danh sách clip như video tải lên từ máy.
 */
export function DriveImport({ onImported, onClose, autoFocus }: DriveImportProps) {
  const [text, setText] = useState("");
  const [session, setSession] = useState<ImportSession | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const unsub = useRef<(() => void) | null>(null);
  const delivered = useRef(new Set<string>());

  useEffect(() => () => unsub.current?.(), []);

  const running = starting || session?.status === "running";

  const deliver = (s: ImportSession) => {
    // Video nào xong là đưa vào danh sách ngay, không phải đợi cả thư mục
    const fresh = s.videos.filter((v) => !delivered.current.has(v.id));
    if (fresh.length) {
      fresh.forEach((v) => delivered.current.add(v.id));
      onImported(fresh);
    }
  };

  const start = async () => {
    setError(null);
    if (!looksLikeDrive(text)) {
      setError("Chưa thấy link Google Drive. Dán link dạng drive.google.com/file/d/… hoặc …/folders/…");
      return;
    }
    setStarting(true);
    try {
      const s = await startDriveImport(text);
      setSession(s);
      delivered.current = new Set();
      unsub.current?.();
      unsub.current = subscribeImport(s.id, {
        onUpdate: (snap) => {
          setSession(snap);
          deliver(snap);
          if (snap.status === "done" && snap.files.every((f) => f.status === "done")) setText("");
        },
        onConnectionLost: () => setError("Mất kết nối tới backend khi đang tải từ Drive."),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không bắt đầu tải được.");
    } finally {
      setStarting(false);
    }
  };

  const failed = session?.files.filter((f) => f.status === "error") ?? [];

  return (
    <div className="space-y-3 rounded-2xl border border-ink-700 bg-ink-900/60 p-4">
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-2 text-sm text-zinc-200">
          <DriveIcon /> Dán link Google Drive
        </p>
        {onClose && !running && (
          <button type="button" onClick={onClose} className="text-xs text-zinc-500 hover:text-zinc-200">
            Đóng
          </button>
        )}
      </div>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        autoFocus={autoFocus}
        disabled={running}
        rows={3}
        spellCheck={false}
        placeholder={"Mỗi dòng 1 link — link video hoặc link thư mục:\nhttps://drive.google.com/file/d/…/view\nhttps://drive.google.com/drive/folders/…"}
        className="w-full resize-y rounded-xl border border-ink-700 bg-black/30 px-3 py-2 font-mono text-xs text-zinc-200 placeholder:text-zinc-600 focus:border-accent/60 focus:outline-none disabled:opacity-60"
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && !running) start();
        }}
      />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] text-zinc-500">
          File/thư mục phải chia sẻ “Bất kỳ ai có đường liên kết”. Thư mục: lấy các video bên trong (theo tên).
        </p>
        {running && session ? (
          <Button variant="ghost" onClick={() => cancelImport(session.id)}>Huỷ tải</Button>
        ) : (
          <Button disabled={!text.trim() || starting} onClick={start}>
            {starting ? "Đang đọc link…" : "Tải từ Drive"}
          </Button>
        )}
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}

      {session && (
        <div className="space-y-2 border-t border-ink-700 pt-3">
          <p className={["text-xs", session.status === "error" ? "text-red-400" : "text-zinc-400"].join(" ")}>{session.message}</p>
          {session.ignored.length > 0 && (
            <p className="text-[11px] text-amber-200/70">Bỏ qua {session.ignored.length} link không phải Google Drive.</p>
          )}
          <ul className="max-h-56 space-y-1.5 overflow-y-auto pr-1">
            {session.files.map((f) => (
              <li key={f.key} className="space-y-1">
                <div className="flex items-baseline justify-between gap-3 text-xs">
                  <span className={["truncate", f.status === "error" ? "text-zinc-500" : "text-zinc-200"].join(" ")} title={f.name}>
                    {f.name}
                  </span>
                  <span className="shrink-0 font-mono text-[11px] text-zinc-500">
                    {f.status === "done" && "✓ đã thêm"}
                    {f.status === "waiting" && "chờ"}
                    {f.status === "downloading" &&
                      (f.total ? `${f.percent}% · ${formatBytes(f.total)}` : formatBytes(f.loaded))}
                  </span>
                </div>
                {f.status === "error" ? (
                  <p className="text-[11px] text-red-400">{f.error}</p>
                ) : (
                  <div className="h-1 overflow-hidden rounded-full bg-ink-700">
                    <div
                      className={[
                        "h-full rounded-full transition-[width] duration-300",
                        f.status === "done" ? "bg-accent/60" : "bg-accent",
                        f.status === "downloading" && !f.total ? "animate-pulse" : "",
                      ].join(" ")}
                      style={{ width: `${f.status === "done" ? 100 : f.status === "downloading" ? (f.total ? f.percent : 100) : 0}%` }}
                    />
                  </div>
                )}
              </li>
            ))}
          </ul>
          {!running && failed.length > 0 && session.status !== "cancelled" && (
            <p className="text-[11px] text-zinc-500">Sửa quyền chia sẻ rồi bấm “Tải từ Drive” lại — video đã thêm sẽ không bị trùng.</p>
          )}
        </div>
      )}
    </div>
  );
}

function DriveIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden>
      <path d="M8.5 3h7l6 10.5-3.5 6h-12L2.5 13.5 8.5 3z" />
      <path d="M8.5 3l6 10.5H2.5M15.5 3l-6 10.5M21.5 13.5h-12l-3.5 6" />
    </svg>
  );
}
