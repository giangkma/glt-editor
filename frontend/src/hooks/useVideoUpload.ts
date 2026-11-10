"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { uploadVideo, type UploadHandle } from "@/lib/upload";
import { validateVideo } from "@/lib/validate";
import type { UploadState } from "@/types/upload";

const initialState: UploadState = {
  status: "idle",
  progress: 0,
  loaded: 0,
  total: 0,
  file: null,
  video: null,
  error: null,
};

export function useVideoUpload() {
  const [state, setState] = useState<UploadState>(initialState);
  const handleRef = useRef<UploadHandle | null>(null);
  const previewRef = useRef<string | null>(null);

  const revokePreview = () => {
    if (previewRef.current) {
      URL.revokeObjectURL(previewRef.current);
      previewRef.current = null;
    }
  };

  const start = useCallback(async (file: File) => {
    const error = validateVideo(file);
    if (error) {
      setState({ ...initialState, status: "error", error });
      return;
    }

    revokePreview();
    setState({ ...initialState, status: "uploading", file, total: file.size });

    const handle = uploadVideo(file, ({ loaded, total, percent }) => {
      setState((s) => ({ ...s, loaded, total, progress: percent }));
    });
    handleRef.current = handle;

    try {
      const { id } = await handle.promise;
      const previewUrl = URL.createObjectURL(file);
      previewRef.current = previewUrl;
      setState((s) => ({
        ...s,
        status: "success",
        progress: 100,
        loaded: file.size,
        video: { id, name: file.name, size: file.size, type: file.type, previewUrl },
      }));
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        setState(initialState);
        return;
      }
      setState((s) => ({
        ...s,
        status: "error",
        error: err instanceof Error ? err.message : "Đã có lỗi xảy ra.",
      }));
    } finally {
      handleRef.current = null;
    }
  }, []);

  const cancel = useCallback(() => handleRef.current?.abort(), []);

  const reset = useCallback(() => {
    handleRef.current?.abort();
    revokePreview();
    setState(initialState);
  }, []);

  // Dọn dẹp khi rời trang
  useEffect(() => () => {
    handleRef.current?.abort();
    revokePreview();
  }, []);

  return { ...state, start, cancel, reset };
}
