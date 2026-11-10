/**
 * AI GỢI Ý ĐĂNG BÀI: xem video đã edit (khung hình) + lời thoại → 3 caption kèm hashtag + câu kêu gọi đặt tour,
 * và 4 gợi ý chữ cho ảnh bìa (1 dòng cách điệu + 1 dòng chữ vuông) để điền vào trình làm bìa.
 * Lưu kết quả cạnh video (outputs/<job>_goiy.json) → mở lại không tốn token.
 */
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { config } from "../config.js";
import { AppError } from "../utils/AppError.js";
import { probe } from "./editor/ffmpeg.js";
import { extractFrames } from "./skills/sources.js";
import { callClaude, claudeEnabled, lineWordCount } from "./skills/planner.js";
import { projectDir } from "./skills/reelPipeline.js";
import { getBrand } from "./brand.js";

const POST_TOOL = {
  name: "submit_post",
  description: "Nộp gợi ý đăng TikTok cho video này.",
  input_schema: {
    type: "object",
    properties: {
      captions: {
        type: "array",
        description: "3 phương án caption TikTok NGẮN, khác giọng điệu (có thể 1 phương án tiếng Anh hoặc trộn Anh–Việt)",
        items: {
          type: "object",
          properties: {
            style: { type: "string", description: "kiểu ngắn: Gây tò mò | Chill | English | Rủ đi…" },
            text: { type: "string", description: "caption 1–2 câu NGẮN (tối đa ~30 từ), 0–2 emoji; KHÔNG chứa hashtag" },
            hashtags: { type: "array", items: { type: "string" }, description: "5–8 hashtag viết liền, không dấu, chữ thường" },
          },
          required: ["style", "text", "hashtags"],
        },
      },
      cover_titles: {
        type: "array",
        description: "4 gợi ý chữ ảnh bìa: dòng cách điệu (ngắn, nhẹ) + dòng chữ vuông IN HOA (to, móc)",
        items: {
          type: "object",
          properties: {
            script: { type: "string", description: "dòng chữ cách điệu, 1–4 từ (vd 'Hướng dẫn', 'Đi trekking')" },
            block: { type: "string", description: "dòng chữ vuông, 2–6 từ, gây tò mò / có con số (vd '3 SAI LẦM KHI LEO NÚI')" },
          },
          required: ["script", "block"],
        },
      },
    },
    required: ["captions", "cover_titles"],
  },
};

const SYSTEM = `Bạn là người làm nội dung TikTok cho kênh trekking / leo núi ở Việt Nam (kênh "Giang Lang Thang").
VIẾT NGẮN: mỗi phương án — cả caption lẫn hashtag — tổng chỉ khoảng 5–60 từ. Caption 1–2 câu ngắn, chất, như người trẻ nói; 0–2 emoji.
Ngôn ngữ: tiếng Việt, tiếng Anh, hoặc trộn Anh–Việt tự nhiên (vd "Sunrise trên đỉnh Samu ☁️"). Trong 3 phương án nên có ít nhất 1 phương án tiếng Anh hoặc trộn.
Không bịa thông tin (giá, ngày, địa danh) không có trong video / lời thoại / thông tin thương hiệu. Không cần câu kêu gọi dài dòng.
Hashtag: 5–8 cái, viết liền không dấu, chữ thường, theo kiểu: #gianglangthang #trekking #leonui #<địa danh trong video, vd lungcung, kyquansan, samu> #viral #xuhuong.
Luôn có #gianglangthang #trekking và #xuhuong hoặc #viral; thêm tên địa danh thấy trong video / lời thoại.
Chữ ảnh bìa: rất ngắn, đọc được trong 1 giây trên màn hình nhỏ.`;

/** Hashtag mặc định của kênh (thêm nếu AI quên) */
const MUST_TAGS = ["#gianglangthang", "#trekking", "#leonui", "#viral", "#xuhuong"];
/** Bỏ dấu tiếng Việt, viết liền, chữ thường */
const tagOf = (h) =>
  "#" +
  String(h ?? "")
    .replace(/^[#@]+/, "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .replace(/[^a-zA-Z0-9_]/g, "")
    .toLowerCase();
const words = (s) => String(s).split(/\s+/).filter(Boolean);
/** Cắt caption cho tổng (chữ + hashtag) ≤ 60 từ, cắt ở cuối câu nếu được */
function trimCaption(text, nTags) {
  const max = Math.max(8, 60 - nTags);
  const w = words(text);
  if (w.length <= max) return text;
  const cut = w.slice(0, max).join(" ");
  const end = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("! "), cut.lastIndexOf("? "));
  return end > cut.length * 0.5 ? cut.slice(0, end + 1) : cut + "…";
}

const file = (jobId) => path.join(config.outputDir, `${jobId}_goiy.json`);

export async function readSuggestions(jobId) {
  if (!existsSync(file(jobId))) return null;
  return JSON.parse(await fs.readFile(file(jobId), "utf8"));
}

function spokenText(job) {
  if (job.pipeline !== "skill") return Promise.resolve("");
  const p = path.join(projectDir(job._options.projectId), "plan.json");
  return fs
    .readFile(p, "utf8")
    .then((s) => JSON.parse(s).plan.manual.flat().map((l) => lineWordCount(l).txt.trim()).join(" "))
    .catch(() => "");
}

export async function makeSuggestions(job, { signal } = {}) {
  if (!claudeEnabled()) throw new AppError("Chưa có ANTHROPIC_API_KEY trong backend/.env — cần Claude để viết gợi ý.", 409, "NO_CLAUDE");
  if (job.status !== "done" || !job._outputPath) throw new AppError("Video chưa dựng xong.", 409, "NOT_READY");
  const info = await probe(job._outputPath);
  const tmp = path.join(config.tmpDir, `goiy_${job.id}`);
  await fs.mkdir(tmp, { recursive: true });
  try {
    const frames = await extractFrames(job._outputPath, info.duration, tmp, { signal, maxFrames: 16 });
    const [speech, brand] = await Promise.all([spokenText(job), getBrand()]);
    const review = job.review ?? {};
    const userText =
      `Video TikTok dọc dài ${info.duration.toFixed(0)} giây (${review.mode === "montage" ? "video chill không lời, chỉ nhạc" : "video có lời thuyết minh"}).\n` +
      (speech ? `Lời thoại trong video: """${speech.slice(0, 4000)}"""\n` : "") +
      (review.summary ? `Tóm tắt cách edit: ${review.summary}\n` : "") +
      `Thương hiệu: ${brand.name || "(chưa đặt tên)"}${brand.phone ? ` · SĐT/Zalo: ${brand.phone}` : ""}` +
      `${brand.hashtags ? ` · hashtag riêng: ${brand.hashtags}` : ""}\n` +
      `Tên file gốc: ${job.videoName}\nXem các khung hình bên dưới rồi nộp gợi ý qua tool submit_post.`;
    const raw = await callClaude({ system: SYSTEM, userText, frames, signal, tool: POST_TOOL, accept: (p) => Array.isArray(p.captions) });
    const fix = (t) => String(t ?? "").trim();
    const result = {
      createdAt: new Date().toISOString(),
      captions: (raw.captions ?? []).slice(0, 3).map((c) => {
        // hashtag: chuẩn hoá, bỏ trùng, đảm bảo có tag của kênh + tag riêng trong trang Thương hiệu, tối đa 8
        const own = String(brand.hashtags ?? "").split(/[\s,]+/).filter(Boolean).map(tagOf);
        let tags = [...new Set([...(Array.isArray(c.hashtags) ? c.hashtags : []).map(tagOf), ...own])].filter((h) => h.length > 2);
        for (const m of MUST_TAGS) if (!tags.includes(m)) tags.push(m);
        const must = new Set([...MUST_TAGS.slice(0, 2), ...own]);
        while (tags.length > 8) {
          const i = tags.findLastIndex((h) => !must.has(h) && h !== "#xuhuong" && h !== "#viral");
          tags.splice(i >= 0 ? i : tags.length - 1, 1);
        }
        return { style: fix(c.style).slice(0, 30), text: trimCaption(fix(c.text), tags.length), hashtags: tags };
      }),
      coverTitles: (raw.cover_titles ?? []).slice(0, 6).map((c) => ({ script: fix(c.script).slice(0, 40), block: fix(c.block).slice(0, 60) })),
    };
    await fs.writeFile(file(job.id), JSON.stringify(result, null, 2), "utf8");
    return result;
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
}
