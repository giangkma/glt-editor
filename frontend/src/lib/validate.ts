import { ACCEPTED_EXTENSIONS, ACCEPTED_VIDEO_TYPES, MAX_FILE_SIZE } from "./config";
import { formatBytes } from "./format";

export function validateVideo(file: File): string | null {
  const ext = "." + (file.name.split(".").pop() ?? "").toLowerCase();
  const typeOk = file.type.startsWith("video/") || ACCEPTED_VIDEO_TYPES.includes(file.type);
  const extOk = ACCEPTED_EXTENSIONS.includes(ext);

  if (!typeOk && !extOk) {
    return `Định dạng không hỗ trợ. Chấp nhận: ${ACCEPTED_EXTENSIONS.join(", ")}`;
  }
  if (file.size > MAX_FILE_SIZE) {
    return `File quá lớn (${formatBytes(file.size)}). Tối đa ${formatBytes(MAX_FILE_SIZE)}.`;
  }
  return null;
}
