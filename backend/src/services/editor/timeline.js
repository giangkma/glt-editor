/**
 * Các hàm thuần (không gọi FFmpeg) để tính timeline sau khi cắt khoảng lặng.
 * Tách riêng để dễ test.
 *
 * Segment = đoạn GIỮ LẠI của video gốc: { start, end, outStart }
 *   start/end : thời điểm trên video gốc (giây)
 *   outStart  : thời điểm đoạn đó bắt đầu trên video sau khi cắt
 */

/** Đọc log của filter silencedetect → danh sách khoảng lặng */
export function parseSilenceLog(lines, duration) {
  const silences = [];
  let currentStart = null;

  for (const line of lines) {
    const s = line.match(/silence_start:\s*(-?[\d.]+)/);
    if (s) {
      currentStart = Math.max(0, Number.parseFloat(s[1]));
      continue;
    }
    const e = line.match(/silence_end:\s*([\d.]+)/);
    if (e && currentStart !== null) {
      silences.push({ start: currentStart, end: Number.parseFloat(e[1]) });
      currentStart = null;
    }
  }
  // Im lặng kéo dài tới cuối video thì FFmpeg không in silence_end
  if (currentStart !== null) silences.push({ start: currentStart, end: duration });
  return silences;
}

/**
 * Từ danh sách khoảng lặng → các đoạn có tiếng nói cần giữ.
 * Mọi mốc được làm tròn theo lưới khung hình (1/fps) để hình và tiếng
 * luôn cắt ở cùng một vị trí → không bị lệch tiếng sau nhiều lần cắt.
 */
export function buildKeepSegments(
  silences,
  duration,
  { fps, paddingSec = 0.12, mergeGapSec = 0.2, minKeepSec = 0.15 },
) {
  // 1. Phần bù của khoảng lặng = đoạn có tiếng
  const speech = [];
  let cursor = 0;
  for (const sil of [...silences].sort((a, b) => a.start - b.start)) {
    if (sil.start > cursor) speech.push({ start: cursor, end: sil.start });
    cursor = Math.max(cursor, sil.end);
  }
  if (cursor < duration) speech.push({ start: cursor, end: duration });

  // 2. Thêm padding, gộp các đoạn quá sát nhau
  const merged = [];
  for (const seg of speech) {
    const start = Math.max(0, seg.start - paddingSec);
    const end = Math.min(duration, seg.end + paddingSec);
    const last = merged.at(-1);
    if (last && start - last.end <= mergeGapSec) last.end = Math.max(last.end, end);
    else merged.push({ start, end });
  }

  // 3. Snap theo lưới khung hình, bỏ đoạn quá ngắn (tiếng lách cách)
  const snap = (t, fn) => fn(t * fps) / fps;
  const maxT = snap(duration, Math.floor);
  let segments = merged
    .map((s) => ({ start: snap(s.start, Math.floor), end: Math.min(maxT, snap(s.end, Math.ceil)) }))
    .filter((s) => s.end - s.start >= minKeepSec);

  // Toàn bộ là im lặng (hoặc không có gì để cắt) → giữ nguyên video
  if (segments.length === 0) segments = [{ start: 0, end: maxT }];

  let outStart = 0;
  return segments.map((s) => {
    const seg = { ...s, outStart };
    outStart += s.end - s.start;
    return seg;
  });
}

export const totalDuration = (segments) =>
  segments.reduce((sum, s) => sum + (s.end - s.start), 0);

/** Đổi 1 thời điểm trên video gốc → thời điểm trên video đã cắt (null nếu nằm trong đoạn bị cắt) */
export function mapTime(t, segments) {
  for (const s of segments) {
    if (t >= s.start && t <= s.end) return s.outStart + (t - s.start);
  }
  return null;
}

/**
 * Đổi timestamp từng chữ (từ Whisper) sang timeline mới.
 * Chữ nằm vắt qua chỗ cắt → kẹp vào đoạn chứa điểm giữa của chữ.
 */
export function remapWords(words, segments) {
  const out = [];
  for (const w of words) {
    const mid = (w.start + w.end) / 2;
    const seg = segments.find((s) => mid >= s.start && mid <= s.end);
    if (!seg) continue;
    const start = seg.outStart + (Math.max(w.start, seg.start) - seg.start);
    const end = seg.outStart + (Math.min(w.end, seg.end) - seg.start);
    out.push({ word: w.word, start, end: Math.max(end, start + 0.05) });
  }
  return out;
}

/** Biểu thức cho filter select/aselect: chọn các khung hình nằm trong đoạn giữ lại */
export function buildSelectExpr(segments, fps) {
  // Lệch nửa khung hình để không bao giờ rơi đúng biên → số khung hình hình & tiếng luôn bằng nhau
  const h = 0.5 / fps;
  return segments
    .map((s) => `between(t,${(s.start - h).toFixed(5)},${(s.end - h).toFixed(5)})`)
    .join("+");
}

/** Chọn fps nguyên gần nhất (24/25/30/50/60) — cần số nguyên để căn khung tiếng theo khung hình */
export function pickFps(rawFps) {
  const candidates = [24, 25, 30, 50, 60];
  const fps = Number.isFinite(rawFps) && rawFps > 0 ? rawFps : 30;
  return candidates.reduce((best, c) => (Math.abs(c - fps) < Math.abs(best - fps) ? c : best), 30);
}
