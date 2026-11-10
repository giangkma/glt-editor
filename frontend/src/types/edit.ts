export type EditStatus = "queued" | "processing" | "done" | "error" | "cancelled";
export type EditStage = string;

/** Số liệu sau khi dựng — mỗi bộ edit trả về một phần các trường này */
export interface EditStats {
  originalDuration?: number;
  outputDuration?: number;
  removedSeconds?: number;
  cuts?: number;
  captions?: number;
  clusters?: number;
  broll?: number;
  soundEffects?: number;
  speed?: number;
  /** Montage: số cảnh, bài nhạc, tempo */
  shots?: number;
  music?: string;
  bpm?: number;
  loudnessLufs?: number;
  resolution?: string;
  hookSeconds?: number;
  ctaSeconds?: number;
  fps?: number;
  encoder?: string;
  processingSeconds?: number;
}

/** Kịch bản skill đã dùng — để người dùng duyệt bản nháp */
export interface EditReview {
  /** bộ màu đã dùng */
  grade?: string;
  /** câu móc chép lên đầu video (voice) */
  hook?: { text: string; reason?: string } | null;
  planner: "claude" | "heuristic";
  summary: string;
  uncertain: { heard: string; guess: string; index: number }[];
  speed: number;
  clusters: number;
  broll: { template: string; from: number; to: number }[];
  behind: string[];
  dark: number;
  /** "montage" = video không lời dựng theo nhạc */
  mode?: "montage";
  music?: string | null;
  /** Montage: tiêu đề kiểu "POV: ..." hiện phía trên */
  title?: string;
  bpm?: number | null;
  shots?: { start: number; beats: number; speed: number; reason: string }[];
  montageSeconds?: number;
  /** Đoạn không lời được giữ (giây theo video nguồn) */
  scenes?: { start: number; end: number; reason: string }[];
  clips?: number;
}

export interface EditStep {
  stage: string;
  label: string;
}

/** Snapshot job mà backend đẩy về qua SSE */
export interface EditJob {
  id: string;
  videoId: string;
  videoName: string;
  clipCount?: number;
  pipeline: "basic" | "skill";
  skillId: string | null;
  mode: "draft" | "final";
  export4k: boolean;
  /** Bản chính 4K 60fps */
  fps60?: boolean;
  /** Ảnh bìa (null = chưa có) */
  cover?: EditCover | null;
  steps: EditStep[];
  status: EditStatus;
  stage: EditStage;
  /** 0 - 100 */
  progress: number;
  message: string;
  warnings: string[];
  stats: EditStats | null;
  review: EditReview | null;
  error: string | null;
  queuePosition: number;
}

/** Tuỳ chọn gửi lên POST /api/edit */
export interface EditOptions {
  /** "basic" = bộ FFmpeg cơ bản | id skill | bỏ trống = skill mặc định */
  style?: string;
  mode?: "draft" | "final";
  export4k?: boolean;
  /** Cùng export4k: xuất 4K 60fps (nguồn 30fps → nội suy chuyển động) */
  fps60?: boolean;
  music?: string[];
  /** Chuyển cảnh của skill: "muot" (mặc định) | "manh" (kiểu gốc, nhiều nháy) */
  transition?: "muot" | "manh";
  /** Nâng cấp chất lượng */
  grade?: "tu-dong" | "tu-nhien" | "rung-tuoi" | "hoang-hon" | "dien-anh";
  hook?: boolean;
  captionStyle?: "tung-tu" | "cum";
  denoise?: boolean;
  stabilize?: boolean;
  reframe?: boolean;
  cta?: boolean;
  /** Loại video: voice (có lời thuyết minh, nhạc thư mục voice) | chill (montage, nhạc thư mục chill, tắt tiếng gốc) */
  videoType?: "voice" | "chill";
}

export interface EditCover {
  status: "working" | "done" | "error";
  progress: number;
  time: number;
  /** 0 = chỉ ảnh bìa | 0.1 = chèn khung đầu | 1 = hiện bìa 1 giây đầu */
  insert: 0 | 0.1 | 1;
  hasVideo: boolean;
  /** bản nháp: bìa sẽ chèn vào bản chính khi duyệt */
  pendingFinal: boolean;
  error: string | null;
  version: number;
}

export interface PostSuggestions {
  createdAt: string;
  captions: { style: string; text: string; hashtags: string[] }[];
  coverTitles: { script: string; block: string }[];
}

export interface ScriptLine {
  mark: string;
  text: string;
  n: number;
  emphasis: "" | "cam" | "hop";
}

export type EditScript =
  | {
      mode: "voice";
      music: string;
      musicOptions: string[];
      hook: { from: number; to: number; reason?: string } | null;
      clusters: ScriptLine[][];
      scenes: { start: number; end: number; reason: string }[];
    }
  | {
      mode: "montage";
      music: string;
      musicOptions: string[];
      shots: { start: number; beats: number; speed: number; reason: string }[];
    };

export interface ReviseEdits {
  lines?: Record<string, string>;
  removeScenes?: number[];
  removeShots?: number[];
  music?: string;
  hook?: boolean;
}
