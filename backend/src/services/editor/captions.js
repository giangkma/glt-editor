/**
 * Phụ đề kiểu TikTok: mỗi lần hiện 2–3 chữ, chữ to đậm viền đen,
 * hiện ra với hiệu ứng "nảy" nhẹ. Chữ có số / câu cảm thán → tô vàng.
 * Xuất ra file .ass để FFmpeg (libass) vẽ thẳng lên video.
 */

const PUNCT_END = /[.!?…,;:]$/;
const EMPHASIS = /(\d|%|!|\?)/;

/** Gom các chữ thành từng cụm ngắn để hiển thị */
export function chunkWords(words, { maxWords = 3, maxChars = 16, maxGapSec = 0.45 } = {}) {
  const chunks = [];
  let cur = [];

  const flush = () => {
    if (!cur.length) return;
    chunks.push({
      text: cur.map((w) => w.word).join(" "),
      start: cur[0].start,
      end: cur.at(-1).end,
    });
    cur = [];
  };

  for (const raw of words) {
    const word = String(raw.word ?? "").trim();
    if (!word) continue;
    const w = { ...raw, word };
    const prev = cur.at(-1);
    const textLen = cur.reduce((n, x) => n + x.word.length + 1, 0) + word.length;

    if (
      prev &&
      (cur.length >= maxWords || textLen > maxChars || w.start - prev.end > maxGapSec || PUNCT_END.test(prev.word))
    ) {
      flush();
    }
    cur.push(w);
  }
  flush();

  // Kéo dài cụm tới cụm kế tiếp nếu khoảng trống nhỏ → chữ không bị nháy
  for (let i = 0; i < chunks.length; i++) {
    const c = chunks[i];
    const next = chunks[i + 1];
    if (next && next.start - c.end < 0.35) c.end = next.start;
    if (c.end - c.start < 0.4) c.end = next ? Math.min(c.start + 0.4, next.start) : c.start + 0.4;
    c.emphasis = EMPHASIS.test(c.text);
  }
  return chunks;
}

const assTime = (sec) => {
  const t = Math.max(0, sec);
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = Math.floor(t % 60);
  const cs = Math.floor((t - Math.floor(t)) * 100);
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
};

const escapeAss = (text) => text.replace(/\\/g, "").replace(/[{}]/g, "").replace(/\n/g, " ");

/** Tạo nội dung file .ass, kích thước khớp với video đầu ra (4K) */
export function buildAss(chunks, { width, height, font = "Arial" }) {
  const vertical = height > width;
  const base = Math.min(width, height);
  const fontSize = Math.round(base * (vertical ? 0.085 : 0.07));
  const outline = Math.max(4, Math.round(fontSize * 0.09));
  const marginV = Math.round(height * (vertical ? 0.24 : 0.1));
  const marginH = Math.round(width * 0.08);

  // Màu ASS dạng &HAABBGGRR
  const WHITE = "&H00FFFFFF";
  const BLACK = "&H00000000";
  const YELLOW = "&H0000E5FF"; // #FFE500

  const header = `[Script Info]
ScriptType: v4.00+
PlayResX: ${width}
PlayResY: ${height}
WrapStyle: 0
ScaledBorderAndShadow: yes
YCbCr Matrix: TV.709

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Caption,${font},${fontSize},${WHITE},${WHITE},${BLACK},&H80000000,-1,0,0,0,100,100,0,0,1,${outline},${Math.round(outline / 2)},2,${marginH},${marginH},${marginV},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  const lines = chunks.map((c) => {
    const color = c.emphasis ? `\\c${YELLOW}` : "";
    // Nảy nhẹ: 80% → 105% → 100% trong ~150ms
    const anim = `{${color}\\fscx80\\fscy80\\t(0,90,\\fscx105\\fscy105)\\t(90,150,\\fscx100\\fscy100)}`;
    const text = escapeAss(c.text).toLocaleUpperCase("vi-VN");
    return `Dialogue: 0,${assTime(c.start)},${assTime(c.end)},Caption,,0,0,0,,${anim}${text}`;
  });

  return header + lines.join("\n") + "\n";
}
