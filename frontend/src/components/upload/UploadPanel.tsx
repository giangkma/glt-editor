"use client";

import { useState } from "react";
import { useMultiUpload } from "@/hooks/useMultiUpload";
import { useAutoEdit } from "@/hooks/useAutoEdit";
import { editUrls } from "@/lib/edit";
import { MOCK_UPLOAD } from "@/lib/config";
import { Button } from "@/components/ui/Button";
import { EditProgress } from "@/components/edit/EditProgress";
import { EditResult } from "@/components/edit/EditResult";
import { VideoDropzone } from "./VideoDropzone";
import { ClipBoard } from "./ClipBoard";
import { DriveImport } from "./DriveImport";
import type { EditOptions as ApiOptions } from "@/types/edit";

/**
 * Điều phối toàn bộ luồng:
 * chọn 1 hoặc nhiều clip → tải lên (%) → sắp thứ tự + chọn phong cách → Auto-Edit (% qua SSE)
 * → [skill: xem nháp → duyệt → bản chính] → xem & tải kết quả
 */
export function UploadPanel() {
  const upload = useMultiUpload();
  const edit = useAutoEdit();
  // Lựa chọn lần edit gần nhất (loại video, nhạc...) → "Thử lại" dùng đúng lựa chọn đó
  const [lastOptions, setLastOptions] = useState<ApiOptions | null>(null);

  const startOver = () => {
    edit.reset();
    upload.reset();
  };

  // ───── Giai đoạn Auto-Edit ─────
  if (edit.phase === "starting" || edit.phase === "processing") {
    return <EditProgress job={edit.job} onCancel={edit.cancel} />;
  }

  if (edit.phase === "done" && edit.job) {
    const urls = editUrls(edit.job.id);
    return (
      <EditResult
        job={edit.job}
        // Mock mode: chưa có backend → phát lại clip đầu
        videoUrl={MOCK_UPLOAD ? upload.clips[0]?.previewUrl ?? "" : urls.file}
        downloadUrl={MOCK_UPLOAD ? null : urls.download}
        onReset={startOver}
        onApprove={(export4k, fps60) => edit.finalize(edit.job!.id, export4k, fps60)}
        onRevise={(edits) => edit.revise(edit.job!.id, edits)}
      />
    );
  }

  if ((edit.phase === "error" || edit.phase === "cancelled") && upload.ready) {
    const retryOptions: ApiOptions =
      edit.job?.pipeline === "skill"
        ? { style: edit.job.skillId ?? undefined, mode: edit.job.mode, export4k: edit.job.export4k, fps60: edit.job.fps60 }
        : { style: "basic" };
    return (
      <div className="w-full animate-fade-up space-y-4 rounded-3xl border border-ink-700 bg-ink-900/60 p-8 text-center">
        <p className="text-lg font-medium text-zinc-100">
          {edit.phase === "cancelled" ? "Đã huỷ render" : "Auto-Edit thất bại"}
        </p>
        {edit.error && <p className="text-sm text-red-400">{edit.error}</p>}
        <div className="flex justify-center gap-2">
          <Button variant="ghost" onClick={edit.reset}>Đổi clip / tuỳ chọn</Button>
          <Button onClick={() => edit.start(upload.ids, lastOptions ?? retryOptions)}>Thử lại</Button>
        </div>
      </div>
    );
  }

  // ───── Giai đoạn chọn & tải clip ─────
  if (upload.clips.length === 0) {
    return (
      <div className="w-full space-y-4">
        <VideoDropzone onFilesSelected={upload.add} />
        <div className="flex items-center gap-3 text-[11px] uppercase tracking-[0.2em] text-zinc-600">
          <span className="h-px flex-1 bg-ink-700" /> hoặc <span className="h-px flex-1 bg-ink-700" />
        </div>
        <DriveImport onImported={upload.addRemote} />
      </div>
    );
  }

  return (
    <ClipBoard
      clips={upload.clips}
      ready={upload.ready}
      onAdd={upload.add}
      onAddRemote={upload.addRemote}
      onRemove={upload.remove}
      onMove={upload.move}
      onRetry={upload.retry}
      onReset={startOver}
      onStart={(options) => {
        setLastOptions(options);
        edit.start(upload.ids, options);
      }}
    />
  );
}
