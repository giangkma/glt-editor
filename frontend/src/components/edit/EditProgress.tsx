"use client";

import { Button } from "@/components/ui/Button";
import { ProgressBar } from "@/components/ui/ProgressBar";
import type { EditJob } from "@/types/edit";

interface EditProgressProps {
  job: EditJob | null;
  onCancel: () => void;
}

export function EditProgress({ job, onCancel }: EditProgressProps) {
  const progress = job?.progress ?? 0;
  const steps = job?.steps ?? [];
  const order = ["queued", ...steps.map((s) => s.stage), "done"];
  // Giai đoạn phụ (vd "upscaling") không có trong danh sách → coi như đã qua hết các bước
  const current = job ? (order.includes(job.stage) ? order.indexOf(job.stage) : order.length - 1) : 0;
  const waiting = !job || job.status === "queued";
  const title =
    job?.pipeline === "skill" ? (job.mode === "draft" ? "Đang dựng bản nháp 720p" : "Đang dựng bản chính") : "Đang Auto-Edit";

  return (
    <div className="flex aspect-[16/9] min-h-[380px] w-full animate-fade-up flex-col items-center justify-center rounded-3xl border border-ink-700 bg-ink-900/60 px-6 sm:px-8">
      <div className="w-full max-w-lg space-y-7">
        <div className="text-center">
          <p className="mb-2 text-xs uppercase tracking-[0.15em] text-zinc-500">
            {title}
            {job?.skillId ? ` · ${job.skillId}` : ""}
          </p>
          <p className="font-mono text-6xl font-light tabular-nums tracking-tight text-zinc-100 sm:text-7xl">
            {progress}
            <span className="text-3xl text-zinc-600">%</span>
          </p>
          <p className="mt-3 min-h-5 text-sm text-zinc-400" aria-live="polite">
            {waiting && job?.queuePosition ? `Đang chờ — vị trí ${job.queuePosition} trong hàng đợi` : job?.message ?? "Đang khởi tạo…"}
          </p>
        </div>

        <ProgressBar value={progress} label="Tiến trình Auto-Edit" />

        {steps.length > 0 && (
          <ol className="flex flex-wrap justify-center gap-x-5 gap-y-2">
            {steps.map((step) => {
              const idx = order.indexOf(step.stage);
              const state = current > idx ? "done" : current === idx ? "active" : "pending";
              return (
                <li key={step.stage} className="flex items-center gap-2 text-xs">
                  <span
                    className={[
                      "h-1.5 w-1.5 shrink-0 rounded-full",
                      state === "done" && "bg-accent",
                      state === "active" && "animate-pulse bg-accent shadow-[0_0_8px_rgba(198,255,61,0.9)]",
                      state === "pending" && "bg-ink-600",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  />
                  <span className={state === "pending" ? "text-zinc-600" : "text-zinc-300"}>{step.label}</span>
                </li>
              );
            })}
          </ol>
        )}

        {job?.warnings.length ? (
          <ul className="space-y-1 rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-xs text-amber-200/80">
            {job.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        ) : null}

        <div className="flex justify-center">
          <Button variant="ghost" onClick={onCancel}>Huỷ render</Button>
        </div>
      </div>
    </div>
  );
}
