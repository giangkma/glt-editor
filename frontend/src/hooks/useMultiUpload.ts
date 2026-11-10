"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { uploadVideo, type UploadHandle } from "@/lib/upload";
import { validateVideo } from "@/lib/validate";
import { API_URL } from "@/lib/config";
import type { RemoteVideo } from "@/lib/drive";

export type ClipStatus = "waiting" | "uploading" | "done" | "error";

export interface Clip {
  key: string;
  /** File trên máy (null nếu video lấy từ Google Drive — đã nằm sẵn trên server) */
  file: File | null;
  name: string;
  size: number;
  /** Nguồn: tải lên từ máy | tải từ Google Drive */
  source: "local" | "drive";
  previewUrl: string;
  status: ClipStatus;
  progress: number;
  /** ID backend trả về sau khi upload xong */
  id: string | null;
  error: string | null;
}

let seq = 0;
const revoke = (c: Clip) => {
  if (c.previewUrl.startsWith("blob:")) URL.revokeObjectURL(c.previewUrl);
};

/**
 * Tải nhiều clip lên lần lượt (từng file một → không nghẽn mạng, % rõ ràng).
 * Sắp xếp / xoá được kể cả khi đang tải; thứ tự trong danh sách = thứ tự ghép reel.
 */
export function useMultiUpload() {
  const [clips, setClips] = useState<Clip[]>([]);
  const clipsRef = useRef<Clip[]>([]);
  const active = useRef<{ key: string; handle: UploadHandle } | null>(null);
  clipsRef.current = clips;

  const patch = (key: string, p: Partial<Clip>) =>
    setClips((cs) => cs.map((c) => (c.key === key ? { ...c, ...p } : c)));

  const add = useCallback((files: File[]) => {
    const next: Clip[] = files.map((file) => {
      const error = validateVideo(file);
      return {
        key: `c${++seq}`,
        file,
        name: file.name,
        size: file.size,
        source: "local",
        previewUrl: URL.createObjectURL(file),
        status: error ? "error" : "waiting",
        progress: 0,
        id: null,
        error,
      };
    });
    setClips((cs) => [...cs, ...next]);
  }, []);

  /** Thêm video đã tải từ Drive về server (không cần upload nữa) */
  const addRemote = useCallback((videos: RemoteVideo[]) => {
    setClips((cs) => {
      const have = new Set(cs.map((c) => c.id));
      const next: Clip[] = videos
        .filter((v) => !have.has(v.id))
        .map((v) => ({
          key: `c${++seq}`,
          file: null,
          name: v.originalName,
          size: v.size,
          source: "drive",
          previewUrl: `${API_URL}/api/videos/${v.id}/file`,
          status: "done",
          progress: 100,
          id: v.id,
          error: null,
        }));
      return [...cs, ...next];
    });
  }, []);

  // Hàng đợi: hễ rảnh là tải clip "waiting" kế tiếp
  useEffect(() => {
    if (active.current) return;
    const nextClip = clips.find((c) => c.status === "waiting" && c.file);
    if (!nextClip?.file) return;

    const handle = uploadVideo(nextClip.file, ({ percent }) => patch(nextClip.key, { progress: percent }));
    active.current = { key: nextClip.key, handle };
    patch(nextClip.key, { status: "uploading", progress: 0 });

    handle.promise
      .then(({ id }) => patch(nextClip.key, { status: "done", progress: 100, id }))
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return; // đã xoá clip
        patch(nextClip.key, { status: "error", error: err instanceof Error ? err.message : "Tải lên thất bại." });
      })
      .finally(() => {
        active.current = null;
        setClips((cs) => [...cs]); // kích hoạt lại hàng đợi
      });
  }, [clips]);

  const remove = useCallback((key: string) => {
    if (active.current?.key === key) active.current.handle.abort();
    setClips((cs) => {
      const c = cs.find((x) => x.key === key);
      if (c) revoke(c);
      return cs.filter((x) => x.key !== key);
    });
  }, []);

  const move = useCallback((key: string, dir: -1 | 1) => {
    setClips((cs) => {
      const i = cs.findIndex((c) => c.key === key);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= cs.length) return cs;
      const next = [...cs];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }, []);

  const retry = useCallback((key: string) => patch(key, { status: "waiting", error: null, progress: 0 }), []);

  const reset = useCallback(() => {
    active.current?.handle.abort();
    clipsRef.current.forEach(revoke);
    setClips([]);
  }, []);

  useEffect(
    () => () => {
      active.current?.handle.abort();
      clipsRef.current.forEach(revoke);
    },
    [],
  );

  const ready = clips.length > 0 && clips.every((c) => c.status === "done");
  const ids = clips.filter((c) => c.status === "done" && c.id).map((c) => c.id as string);
  const busy = clips.some((c) => c.status === "uploading" || c.status === "waiting");

  return { clips, add, addRemote, remove, move, retry, reset, ready, ids, busy };
}
