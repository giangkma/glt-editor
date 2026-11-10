import { API_URL, MOCK_UPLOAD } from "./config";
import type { EditJob, EditOptions, EditScript, PostSuggestions, ReviseEdits } from "@/types/edit";

export interface EditUrls {
  /** Xem video kết quả */
  file: string;
  /** Tải file .mp4 */
  download: string;
}

export function editUrls(jobId: string): EditUrls {
  return {
    file: `${API_URL}/api/edit/${jobId}/file`,
    download: `${API_URL}/api/edit/${jobId}/download`,
  };
}

async function readError(res: Response): Promise<string> {
  try {
    const body = await res.json();
    return body?.error?.message ?? `Lỗi HTTP ${res.status}`;
  } catch {
    return `Lỗi HTTP ${res.status}`;
  }
}

/** POST /api/edit → tạo job, trả về snapshot ban đầu */
/** videoIds: 1 clip hoặc nhiều clip (ghép thành 1 reel theo đúng thứ tự) */
export async function startEdit(videoIds: string[], options: EditOptions = {}): Promise<EditJob> {
  if (MOCK_UPLOAD) return mockJob(videoIds[0], options);

  let res: Response;
  try {
    res = await fetch(`${API_URL}/api/edit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ videoIds, options }),
    });
  } catch {
    throw new Error("Không kết nối được tới server. Backend đã chạy chưa?");
  }
  if (!res.ok) throw new Error(await readError(res));
  const data = await res.json();
  return data.job as EditJob;
}

/** Duyệt bản nháp (skill) → dựng bản chính, dùng lại kịch bản đã duyệt */
export async function finalizeEdit(jobId: string, export4k: boolean, fps60 = false): Promise<EditJob> {
  if (MOCK_UPLOAD) {
    const prev = mockJobs.get(jobId);
    const job = mockJob(prev?.videoId ?? "mock");
    Object.assign(job, { mode: "final", export4k, fps60: export4k && fps60, pipeline: "skill", skillId: prev?.skillId ?? null, steps: prev?.steps ?? [] });
    return job;
  }
  let res: Response;
  try {
    res = await fetch(`${API_URL}/api/edit/${jobId}/finalize`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ export4k, fps60: export4k && fps60 }),
    });
  } catch {
    throw new Error("Không kết nối được tới server. Backend đã chạy chưa?");
  }
  if (!res.ok) throw new Error(await readError(res));
  return (await res.json()).job as EditJob;
}

export async function cancelEdit(jobId: string): Promise<void> {
  if (MOCK_UPLOAD) return;
  await fetch(`${API_URL}/api/edit/${jobId}`, { method: "DELETE" }).catch(() => {});
}

interface SubscribeHandlers {
  onUpdate: (job: EditJob) => void;
  /** Mất kết nối hẳn (EventSource đã bỏ cuộc) */
  onConnectionLost?: () => void;
}

/**
 * Nghe tiến trình qua Server-Sent Events.
 * Trả về hàm huỷ đăng ký — nhớ gọi khi component unmount.
 */
export function subscribeEdit(jobId: string, { onUpdate, onConnectionLost }: SubscribeHandlers): () => void {
  if (MOCK_UPLOAD) return mockSubscribe(jobId, onUpdate);

  const es = new EventSource(`${API_URL}/api/edit/${jobId}/events`);

  const handle = (e: MessageEvent<string>) => {
    try {
      const job = JSON.parse(e.data) as EditJob;
      onUpdate(job);
      // Trạng thái cuối → đóng kết nối, không để trình duyệt tự kết nối lại
      if (job.status === "done" || job.status === "error" || job.status === "cancelled") es.close();
    } catch {
      /* bỏ qua gói tin hỏng */
    }
  };

  es.addEventListener("progress", handle);
  es.addEventListener("done", handle);
  es.addEventListener("failed", handle);
  es.addEventListener("cancelled", handle);

  // Lỗi mạng: EventSource tự kết nối lại (retry 3s). Chỉ báo khi nó đã bỏ cuộc hẳn.
  es.onerror = () => {
    if (es.readyState === EventSource.CLOSED) onConnectionLost?.();
  };

  return () => es.close();
}

// ─────────────── Giả lập (NEXT_PUBLIC_MOCK_UPLOAD=true) ───────────────

const mockJobs = new Map<string, EditJob>();

const MOCK_SKILL_STEPS = [
  { stage: "transcribing", label: "Gỡ băng" },
  { stage: "planning", label: "AI lên kịch bản" },
  { stage: "checking", label: "Chạy khô B-roll" },
  { stage: "rendering", label: "Dựng hình 3D" },
  { stage: "mixing", label: "Âm thanh & xuất" },
];

function mockJob(videoId: string, options: EditOptions = {}): EditJob {
  const job: EditJob = {
    id: `mockjob_${Date.now().toString(36)}`,
    videoId,
    videoName: "mock.mp4",
    pipeline: "skill",
    skillId: "reel-doc-3d",
    mode: options.mode ?? "draft",
    export4k: Boolean(options.export4k),
    steps: MOCK_SKILL_STEPS,
    review: null,
    status: "queued",
    stage: "queued",
    progress: 0,
    message: "Đang chờ trong hàng đợi",
    warnings: [],
    stats: null,
    error: null,
    queuePosition: 1,
  };
  mockJobs.set(job.id, job);
  return job;
}

function mockSubscribe(jobId: string, onUpdate: (job: EditJob) => void) {
  const base = mockJobs.get(jobId);
  if (!base) return () => {};
  let p = 0;
  const timer = setInterval(() => {
    p = Math.min(100, p + 1 + Math.random() * 2);
    const stage = p < 14 ? "transcribing" : p < 20 ? "planning" : p < 23 ? "checking" : p < 88 ? "rendering" : p < 100 ? "mixing" : "done";
    const done = p >= 100;
    onUpdate({
      ...base,
      status: done ? "done" : "processing",
      stage,
      progress: Math.floor(p),
      message: done ? "Hoàn tất" : "Đang xử lý (giả lập)",
      queuePosition: 0,
      stats: done
        ? {
            originalDuration: 62.4, outputDuration: 48.1, clusters: 41, broll: 6, soundEffects: 58, speed: 1.1,
            loudnessLufs: -14, resolution: base.mode === "draft" ? "720x1280" : "1080x1920", fps: 30, processingSeconds: 95,
          }
        : null,
      review: done
        ? {
            planner: "claude",
            summary: "Bỏ 2 câu vấp và tiếng “à”, minh hoạ doanh thu tăng gấp 3 và 100 khách đầu tiên (giả lập).",
            uncertain: [{ heard: "Hormozi ô ét", guess: "Hormozi OS", index: 12 }],
            speed: 1.1, clusters: 41, broll: [{ template: "BRevenue", from: 4, to: 5 }, { template: "BCustomers", from: 9, to: 9 }],
            behind: ["AI", "X3"], dark: 8,
          }
        : null,
    });
    if (done) clearInterval(timer);
  }, 150);
  return () => clearInterval(timer);
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${url}`, init);
  } catch {
    throw new Error("Không kết nối được tới server. Backend đã chạy chưa?");
  }
  if (!res.ok) throw new Error(await readError(res));
  return res.json() as Promise<T>;
}

/** Kịch bản chỉnh được của bản nháp (chữ phụ đề, cảnh, nhạc) */
export const fetchScript = (jobId: string) => api<{ script: EditScript }>(`/api/edit/${jobId}/script`).then((d) => d.script);

/** Chỉnh nhanh → dựng lại bản nháp (không gọi AI) */
export const reviseEdit = (jobId: string, edits: ReviseEdits) =>
  api<{ job: EditJob }>(`/api/edit/${jobId}/revise`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(edits),
  }).then((d) => d.job);

/** Gợi ý đăng bài đã lưu (null nếu chưa tạo) */
export const fetchSuggestions = (jobId: string) =>
  api<{ suggestions: PostSuggestions | null }>(`/api/edit/${jobId}/suggest`).then((d) => d.suggestions);

/** AI xem video → caption + hashtag + chữ ảnh bìa */
export const makeSuggestions = (jobId: string) =>
  api<{ suggestions: PostSuggestions }>(`/api/edit/${jobId}/suggest`, { method: "POST" }).then((d) => d.suggestions);

/** Studio: xuất lại với chữ / hiệu ứng đã sửa (không dựng lại video nền) */
export const recomposeEdit = (jobId: string) =>
  api<{ job: EditJob }>(`/api/edit/${jobId}/recompose`, { method: "POST" }).then((d) => d.job);
