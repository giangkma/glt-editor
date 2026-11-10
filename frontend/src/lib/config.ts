export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
export const MOCK_UPLOAD = process.env.NEXT_PUBLIC_MOCK_UPLOAD === "true";

/** Giới hạn dung lượng: 2 GB */
export const MAX_FILE_SIZE = 2 * 1024 * 1024 * 1024;

export const ACCEPTED_VIDEO_TYPES = [
  "video/mp4",
  "video/quicktime", // .mov
  "video/webm",
  "video/x-matroska", // .mkv
  "video/x-msvideo", // .avi
];

export const ACCEPTED_EXTENSIONS = [".mp4", ".mov", ".webm", ".mkv", ".avi"];
