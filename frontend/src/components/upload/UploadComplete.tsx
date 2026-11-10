"use client";

import { useState } from "react";
import { formatBytes } from "@/lib/format";
import { Button } from "@/components/ui/Button";
import { EditOptions, toApiOptions, type EditChoice } from "@/components/edit/EditOptions";
import type { UploadedVideo } from "@/types/upload";
import type { EditOptions as ApiOptions } from "@/types/edit";

interface UploadCompleteProps {
  video: UploadedVideo;
  onStartAutoEdit: (video: UploadedVideo, options: ApiOptions) => void;
  onReset: () => void;
}

export function UploadComplete({ video, onStartAutoEdit, onReset }: UploadCompleteProps) {
  const [choice, setChoice] = useState<EditChoice | null>(null);

  return (
    <div className="w-full animate-fade-up space-y-6">
      <div className="overflow-hidden rounded-3xl border border-ink-700 bg-black">
        <video
          src={video.previewUrl}
          controls
          playsInline
          className="aspect-[16/9] w-full object-contain"
        />
      </div>

      <EditOptions value={choice} onChange={setChoice} />

      <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent">
            <CheckIcon />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-zinc-100" title={video.name}>{video.name}</p>
            <p className="text-xs text-zinc-500">{formatBytes(video.size)} · Tải lên hoàn tất</p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <Button variant="ghost" onClick={onReset}>Video khác</Button>
          <Button disabled={!choice} onClick={() => choice && onStartAutoEdit(video, toApiOptions(choice))}>
            <SparkIcon />
            Bắt đầu Auto-Edit
          </Button>
        </div>
      </div>
    </div>
  );
}

function CheckIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function SparkIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 2l1.9 6.1L20 10l-6.1 1.9L12 18l-1.9-6.1L4 10l6.1-1.9L12 2z" />
    </svg>
  );
}
