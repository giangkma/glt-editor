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
        description: "3 phương án caption TikTok khác giọng điệu",
        items: {
          type: "object",
          properties: {
            style: { type: "string", description: "kiểu: Gây tò mò | Kể chuyện | Bán hàng…" },
            text: { type: "string", description: "caption tiếng Việt (1–3 câu, có emoji vừa phải, câu kêu gọi hành động ở cuối; KHÔNG chứa hashtag)" },
            hashtags: { type: "array", items: { type: "string" }, description: "5–8 hashtag, không dấu, bắt đầu bằng #" },
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

const SYSTEM = `Bạn là người làm nội dung TikTok cho một đơn vị tổ chức tour trekking / du lịch trải nghiệm ở Việt Nam.
Viết tự nhiên như người Việt trẻ, không sáo rỗng, không bịa thông tin (giá, ngày, địa danh) không có trong video / lời thoại / thông tin thương hiệu.
Caption: dòng đầu là móc (câu hỏi, con số, điều bất ngờ), sau đó 1–2 câu nội dung, cuối là kêu gọi hành động (bình luận, nhắn tin, đặt tour; có SĐT nếu được cung cấp).
Hashtag: trộn hashtag rộng (#trekking #dulich #xuhuong) và hashtag riêng theo địa danh trong video; có hashtag thương hiệu nếu được cung cấp.
Chữ ảnh bìa: rất ngắn, đọc được trong 1 giây trên màn hình nhỏ.`;

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
      captions: (raw.captions ?? []).slice(0, 3).map((c) => ({
        style: fix(c.style).slice(0, 40),
        text: fix(c.text).slice(0, 1200),
        hashtags: (Array.isArray(c.hashtags) ? c.hashtags : [])
          .map((h) => "#" + fix(h).replace(/^#+/, "").replace(/\s+/g, ""))
          .filter((h) => h.length > 1)
          .slice(0, 10),
      })),
      coverTitles: (raw.cover_titles ?? []).slice(0, 6).map((c) => ({ script: fix(c.script).slice(0, 40), block: fix(c.block).slice(0, 60) })),
    };
    await fs.writeFile(file(job.id), JSON.stringify(result, null, 2), "utf8");
    return result;
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
}
