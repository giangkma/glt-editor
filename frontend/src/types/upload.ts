export type UploadStatus = "idle" | "uploading" | "success" | "error";

export interface UploadedVideo {
  /** ID backend trả về, dùng cho bước Auto-Edit */
  id: string;
  name: string;
  size: number;
  type: string;
  /** Object URL để preview video ngay trên trình duyệt */
  previewUrl: string;
}

export interface UploadState {
  status: UploadStatus;
  /** 0 - 100 */
  progress: number;
  /** Số byte đã tải lên (để hiển thị "120 MB / 340 MB") */
  loaded: number;
  total: number;
  file: File | null;
  video: UploadedVideo | null;
  error: string | null;
}
