"use client";

import { useRef, useState, type DragEvent, type KeyboardEvent } from "react";
import { ACCEPTED_EXTENSIONS } from "@/lib/config";

interface VideoDropzoneProps {
  /** Nhận 1 hoặc nhiều file (kéo thả / chọn nhiều cùng lúc) */
  onFilesSelected: (files: File[]) => void;
  error?: string | null;
}

export function VideoDropzone({ onFilesSelected, error }: VideoDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  // Đếm dragenter/dragleave để không bị nháy khi rê qua phần tử con
  const dragCounter = useRef(0);

  const openPicker = () => inputRef.current?.click();

  const handleDragEnter = (e: DragEvent) => {
    e.preventDefault();
    dragCounter.current += 1;
    if (e.dataTransfer.types.includes("Files")) setIsDragging(true);
  };

  const handleDragLeave = (e: DragEvent) => {
    e.preventDefault();
    dragCounter.current -= 1;
    if (dragCounter.current === 0) setIsDragging(false);
  };

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    dragCounter.current = 0;
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files ?? []);
    if (files.length) onFilesSelected(files);
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      openPicker();
    }
  };

  return (
    <div className="w-full">
      <div
        role="button"
        tabIndex={0}
        aria-label="Kéo thả hoặc bấm để chọn video"
        onClick={openPicker}
        onKeyDown={handleKeyDown}
        onDragEnter={handleDragEnter}
        onDragOver={(e) => e.preventDefault()}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={[
          "group relative flex aspect-[16/9] min-h-[320px] w-full cursor-pointer flex-col items-center justify-center",
          "overflow-hidden rounded-3xl border border-dashed transition-all duration-300",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
          isDragging
            ? "scale-[1.01] border-accent bg-accent-soft"
            : "border-ink-600 bg-ink-900/60 hover:border-zinc-500 hover:bg-ink-800/60",
        ].join(" ")}
      >
        {/* Lưới nền mờ */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.35] [mask-image:radial-gradient(ellipse_at_center,black_20%,transparent_70%)]"
          style={{
            backgroundImage:
              "linear-gradient(to right, #ffffff0d 1px, transparent 1px), linear-gradient(to bottom, #ffffff0d 1px, transparent 1px)",
            backgroundSize: "40px 40px",
          }}
        />

        <div className="relative flex flex-col items-center gap-6 px-6 text-center">
          <div
            className={[
              "flex h-20 w-20 items-center justify-center rounded-2xl border transition-all duration-300",
              isDragging
                ? "-translate-y-1 border-accent bg-accent text-ink-950"
                : "border-ink-600 bg-ink-800 text-zinc-300 group-hover:-translate-y-1 group-hover:text-accent",
            ].join(" ")}
          >
            <UploadIcon />
          </div>

          <div className="space-y-2">
            <p className="text-xl font-medium tracking-tight text-zinc-100 sm:text-2xl">
              {isDragging ? "Thả video vào đây" : "Kéo & thả 1 hoặc nhiều video"}
            </p>
            <p className="text-sm text-zinc-500">
              hoặc <span className="text-zinc-200 underline decoration-ink-600 underline-offset-4 group-hover:decoration-accent">chọn file từ máy</span>
            </p>
          </div>

          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-zinc-600">
            {ACCEPTED_EXTENSIONS.join("  ·  ").replace(/\./g, "")}  ·  tối đa 2GB
          </p>
        </div>

        <input
          ref={inputRef}
          type="file"
          multiple
          accept={["video/*", ...ACCEPTED_EXTENSIONS].join(",")}
          className="hidden"
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            if (files.length) onFilesSelected(files);
            e.target.value = ""; // cho phép chọn lại cùng 1 file
          }}
        />
      </div>

      {error && (
        <p role="alert" className="mt-4 animate-fade-up text-center text-sm text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}

function UploadIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 16V4" />
      <path d="m7 9 5-5 5 5" />
      <path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
    </svg>
  );
}
