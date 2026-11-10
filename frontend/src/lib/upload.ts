import { API_URL, MOCK_UPLOAD } from "./config";

export interface UploadProgressEvent {
  loaded: number;
  total: number;
  percent: number;
}

export interface UploadResponse {
  success: boolean;
  message?: string;
  id: string;
  video?: {
    id: string;
    originalName: string;
    size: number;
    mimeType: string;
    url: string;
  };
}

export interface UploadHandle {
  promise: Promise<UploadResponse>;
  abort: () => void;
}

/**
 * Upload video bằng XMLHttpRequest (fetch() chưa hỗ trợ theo dõi
 * tiến trình upload một cách ổn định trên mọi trình duyệt).
 *
 * Backend (bước 2) cần có: POST /api/upload, field "video" (multipart/form-data),
 * trả về JSON: { success: true, id: "...", video: {...} }
 */
export function uploadVideo(
  file: File,
  onProgress: (e: UploadProgressEvent) => void,
): UploadHandle {
  if (MOCK_UPLOAD) return mockUpload(file, onProgress);

  const xhr = new XMLHttpRequest();

  const promise = new Promise<UploadResponse>((resolve, reject) => {
    const form = new FormData();
    form.append("video", file);

    xhr.upload.addEventListener("progress", (e) => {
      if (!e.lengthComputable) return;
      onProgress({
        loaded: e.loaded,
        total: e.total,
        percent: Math.round((e.loaded / e.total) * 100),
      });
    });

    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText) as UploadResponse);
        } catch {
          reject(new Error("Phản hồi từ server không hợp lệ."));
        }
      } else {
        // Backend trả về { success: false, error: { code, message } }
        let message = `Upload thất bại (HTTP ${xhr.status}).`;
        try {
          const body = JSON.parse(xhr.responseText);
          if (body?.error?.message) message = body.error.message;
        } catch {
          /* response không phải JSON */
        }
        reject(new Error(message));
      }
    });

    xhr.addEventListener("error", () =>
      reject(new Error("Không kết nối được tới server. Backend đã chạy chưa?")),
    );
    xhr.addEventListener("abort", () => reject(new DOMException("Đã huỷ", "AbortError")));

    xhr.open("POST", `${API_URL}/api/upload`);
    xhr.send(form);
  });

  return { promise, abort: () => xhr.abort() };
}

/** Giả lập upload để test UI khi chưa có backend */
function mockUpload(
  file: File,
  onProgress: (e: UploadProgressEvent) => void,
): UploadHandle {
  let timer: ReturnType<typeof setInterval> | undefined;
  let rejectFn: ((reason?: unknown) => void) | undefined;

  const promise = new Promise<UploadResponse>((resolve, reject) => {
    rejectFn = reject;
    const total = file.size || 1;
    let loaded = 0;
    // ~4 giây cho 100%, bước nhảy ngẫu nhiên cho giống thật
    timer = setInterval(() => {
      loaded = Math.min(total, loaded + total * (0.02 + Math.random() * 0.05));
      onProgress({ loaded, total, percent: Math.round((loaded / total) * 100) });
      if (loaded >= total) {
        clearInterval(timer);
        resolve({ success: true, id: `mock_${Date.now().toString(36)}` });
      }
    }, 120);
  });

  return {
    promise,
    abort: () => {
      clearInterval(timer);
      rejectFn?.(new DOMException("Đã huỷ", "AbortError"));
    },
  };
}
