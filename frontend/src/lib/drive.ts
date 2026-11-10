import { API_URL, MOCK_UPLOAD } from "./config";

export type ImportFileStatus = "waiting" | "downloading" | "done" | "error";

export interface RemoteVideo {
  id: string;
  originalName: string;
  size: number;
}

export interface ImportFile {
  key: string;
  name: string;
  status: ImportFileStatus;
  percent: number;
  loaded: number;
  total: number;
  error: string | null;
  video: RemoteVideo | null;
}

export interface ImportSession {
  id: string;
  status: "running" | "done" | "error" | "cancelled";
  message: string;
  ignored: string[];
  files: ImportFile[];
  videos: RemoteVideo[];
}

/** Có link Google Drive trong đoạn văn bản không (kiểm tra nhanh phía trình duyệt) */
export const looksLikeDrive = (text: string) =>
  /drive\.google\.com\/(?:file\/d\/|drive\/(?:u\/\d+\/)?folders\/|open\?id=|uc\?)|\/folders\/[\w-]{20,}/.test(text);

export async function startDriveImport(links: string): Promise<ImportSession> {
  if (MOCK_UPLOAD) throw new Error("Chế độ giả lập không tải được từ Drive — tắt NEXT_PUBLIC_MOCK_UPLOAD và chạy backend.");
  let res: Response;
  try {
    res = await fetch(`${API_URL}/api/import/drive`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ links }),
    });
  } catch {
    throw new Error("Không kết nối được backend.");
  }
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.success) throw new Error(data?.error?.message ?? data?.message ?? `Lỗi ${res.status}`);
  return data.session as ImportSession;
}

interface Handlers {
  onUpdate: (s: ImportSession) => void;
  onConnectionLost?: () => void;
}

/** Theo dõi tiến trình tải qua SSE. Trả về hàm huỷ theo dõi. */
export function subscribeImport(id: string, { onUpdate, onConnectionLost }: Handlers): () => void {
  const es = new EventSource(`${API_URL}/api/import/${id}/events`);
  let finished = false;
  const handle = (e: MessageEvent) => {
    try {
      const s = JSON.parse(e.data) as ImportSession;
      onUpdate(s);
      if (s.status !== "running") {
        finished = true;
        es.close();
      }
    } catch {
      /* bỏ qua gói lỗi */
    }
  };
  for (const ev of ["progress", "done", "failed", "cancelled"]) es.addEventListener(ev, handle as EventListener);
  es.onerror = () => {
    if (finished) return;
    if (es.readyState === EventSource.CLOSED) onConnectionLost?.();
  };
  return () => es.close();
}

export async function cancelImport(id: string): Promise<void> {
  await fetch(`${API_URL}/api/import/${id}`, { method: "DELETE" }).catch(() => {});
}
