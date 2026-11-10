"use client";

import { formatBytes } from "@/lib/format";
import { Button } from "@/components/ui/Button";
import { ProgressBar } from "@/components/ui/ProgressBar";

interface UploadProgressProps {
  fileName: string;
  progress: number;
  loaded: number;
  total: number;
  onCancel: () => void;
}

export function UploadProgress({ fileName, progress, loaded, total, onCancel }: UploadProgressProps) {
  return (
    <div className="flex aspect-[16/9] min-h-[320px] w-full animate-fade-up flex-col items-center justify-center rounded-3xl border border-ink-700 bg-ink-900/60 px-8">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <p className="font-mono text-6xl font-light tabular-nums tracking-tight text-zinc-100 sm:text-7xl">
            {progress}
            <span className="text-3xl text-zinc-600">%</span>
          </p>
          <p className="mt-3 text-sm text-zinc-500">Đang tải lên…</p>
        </div>

        <ProgressBar value={progress} label="Tiến trình tải lên" />

        <div className="flex items-center justify-between gap-4 text-xs text-zinc-500">
          <span className="truncate" title={fileName}>{fileName}</span>
          <span className="shrink-0 font-mono tabular-nums">
            {formatBytes(loaded)} / {formatBytes(total)}
          </span>
        </div>

        <div className="flex justify-center">
          <Button variant="ghost" onClick={onCancel}>Huỷ</Button>
        </div>
      </div>
    </div>
  );
}
