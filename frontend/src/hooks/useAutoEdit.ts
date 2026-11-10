"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cancelEdit, finalizeEdit, recomposeEdit, reviseEdit, startEdit, subscribeEdit } from "@/lib/edit";
import type { EditJob, EditOptions, ReviseEdits } from "@/types/edit";

type Phase = "idle" | "starting" | "processing" | "done" | "error" | "cancelled";

export function useAutoEdit() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [job, setJob] = useState<EditJob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const unsubscribeRef = useRef<(() => void) | null>(null);

  const stopListening = () => {
    unsubscribeRef.current?.();
    unsubscribeRef.current = null;
  };

  /** Tạo job (hàm create) rồi nghe tiến trình qua SSE */
  const run = useCallback(async (create: () => Promise<EditJob>) => {
    stopListening();
    setError(null);
    setJob(null);
    setPhase("starting");

    try {
      const created = await create();
      setJob(created);
      setPhase("processing");

      unsubscribeRef.current = subscribeEdit(created.id, {
        onUpdate: (next) => {
          setJob(next);
          if (next.status === "done") setPhase("done");
          else if (next.status === "cancelled") setPhase("cancelled");
          else if (next.status === "error") {
            setPhase("error");
            setError(next.error ?? "Xử lý thất bại.");
          }
        },
        onConnectionLost: () => {
          setPhase("error");
          setError("Mất kết nối tới server trong lúc render.");
        },
      });
    } catch (err) {
      setPhase("error");
      setError(err instanceof Error ? err.message : "Không bắt đầu được Auto-Edit.");
    }
  }, []);

  const start = useCallback(
    (videoIds: string[], options?: EditOptions) => run(() => startEdit(videoIds, options)),
    [run],
  );

  /** Duyệt bản nháp → dựng bản chính */
  const finalize = useCallback(
    (draftJobId: string, export4k: boolean, fps60 = false) => run(() => finalizeEdit(draftJobId, export4k, fps60)),
    [run],
  );

  /** Chỉnh nhanh bản nháp → dựng lại */
  const revise = useCallback((draftJobId: string, edits: ReviseEdits) => run(() => reviseEdit(draftJobId, edits)), [run]);

  /** Studio: xuất lại chữ + hiệu ứng */
  const recompose = useCallback((jobId: string) => run(() => recomposeEdit(jobId)), [run]);

  const cancel = useCallback(async () => {
    if (!job) return;
    await cancelEdit(job.id);
    // Trạng thái "cancelled" sẽ về qua SSE; mock mode thì tự chốt
    stopListening();
    setPhase("cancelled");
  }, [job]);

  const reset = useCallback(() => {
    stopListening();
    setPhase("idle");
    setJob(null);
    setError(null);
  }, []);

  useEffect(() => stopListening, []);

  return { phase, job, error, start, finalize, revise, recompose, cancel, reset };
}
