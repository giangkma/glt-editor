/**
 * Lên kịch bản edit cho skill reel-doc-3d = các bước 3–5 trong SKILL.md:
 * chọn đoạn giữ (WRANGES), chia cụm chữ (MANUAL), gán B-roll 3D / chữ sau đầu / nền tối, chọn SPEED.
 *
 * - Có ANTHROPIC_API_KEY → Claude đọc nguyên văn SKILL.md + lời thoại rồi quyết định (giống khi dùng skill trong Claude Code)
 * - Không có key / Claude lỗi → kịch bản tự động đơn giản (heuristicPlan)
 * Mọi kịch bản đều qua validatePlan (giống soat_cum.py) trước khi ghi du_an.py.
 */
import { config } from "../../config.js";

// ───────────── Lời thoại ─────────────

export function readTranscript(tj) {
  const words = [];
  const pauses = [];
  for (const item of tj.timeline ?? []) {
    if (item.t === "w") words.push({ i: words.length, seg: item.seg, s: item.s, e: item.e, x: String(item.x) });
    else if (item.t === "p") pauses.push({ s: item.s, d: item.d });
  }
  return { words, pauses };
}

/** Giống liet_ke.py: mỗi câu 1 dòng, mỗi từ kèm (số thứ tự:giây) */
export function formatTranscript(words) {
  const lines = [];
  let cur = null;
  let line = [];
  for (const w of words) {
    if (w.seg !== cur) {
      if (line.length) lines.push(line.join(" "));
      cur = w.seg;
      line = [`[${cur}]`];
    }
    line.push(`${w.x}(${w.i}:${w.s.toFixed(2)})`);
  }
  if (line.length) lines.push(line.join(" "));
  return lines.join("\n");
}

// ───────────── Kiểm tra kịch bản (port của soat_cum.py) ─────────────

const norm = (x) => x.toLowerCase().replace(/[^\p{L}\p{N}%]/gu, "");

/** Số từ mà 1 dòng MANUAL "ăn" — đúng logic của reel_engine.manual_plan */
export function lineWordCount(raw) {
  const txt = raw[0] === "*" || raw[0] === "!" ? raw.slice(1) : raw;
  if (txt.includes("|")) {
    const parts = txt.split("|");
    if (parts.length !== 2) return { n: NaN, txt };
    return { n: Number.parseInt(parts[1], 10), txt: parts[0], override: true };
  }
  return { n: txt.trim().split(/\s+/).filter(Boolean).length, txt };
}

export function widxFromRanges(wranges) {
  const idx = [];
  for (const [a, b] of wranges) for (let i = a; i <= b; i++) idx.push(i);
  return idx;
}

/**
 * @returns {{ plan: object, errors: string[], warnings: string[] }}
 * errors  → phải sửa (lệch số từ, sai chỉ số…) — engine sẽ chạy sai/lỗi
 * warnings → đã tự sửa (bỏ B-roll sai tên, bỏ tham số lạ…)
 */
export function validatePlan(raw, words, templates, { duration = Infinity } = {}) {
  const errors = [];
  const warnings = [];
  const n = words.length;
  const plan = { ...raw };

  // SPEED
  const speed = Number(raw.speed);
  plan.speed = Number.isFinite(speed) ? Math.min(1.3, Math.max(1.0, speed)) : 1.1;

  // WRANGES
  const wr = Array.isArray(raw.wranges) ? raw.wranges : [];
  plan.wranges = [];
  let last = -1;
  for (const r of wr) {
    const [a, b] = Array.isArray(r) ? r.map(Number) : [NaN, NaN];
    if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b >= n || a > b) {
      errors.push(`wranges: đoạn ${JSON.stringify(r)} không hợp lệ (chỉ số từ 0 đến ${n - 1}, a ≤ b).`);
      continue;
    }
    if (a <= last) {
      errors.push(`wranges: đoạn [${a}, ${b}] chồng lên/đứng trước đoạn trước (phải tăng dần, không chồng).`);
      continue;
    }
    plan.wranges.push([a, b]);
    last = b;
  }
  // SCENES: đoạn KHÔNG LỜI cần giữ (giây theo video nguồn)
  plan.scenes = [];
  for (const sc of Array.isArray(raw.scenes) ? raw.scenes : []) {
    let a = Number(sc?.start);
    let b = Number(sc?.end);
    if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
    a = Math.max(0, a);
    b = Math.min(duration, b);
    if (b - a < 0.5) continue;
    plan.scenes.push({ start: Math.round(a * 100) / 100, end: Math.round(b * 100) / 100, reason: String(sc?.reason ?? "").slice(0, 120) });
  }
  plan.scenes.sort((x, y) => x.start - y.start);
  if (!plan.wranges.length && !plan.scenes.length) errors.push("wranges và scenes đều rỗng — không có gì để giữ.");
  const widx = widxFromRanges(plan.wranges);
  const toks = widx.map((i) => words[i].x);

  // MANUAL
  const manual = Array.isArray(raw.manual) ? raw.manual : [];
  plan.manual = [];
  let k = 0;
  const mismatches = [];
  if (!plan.wranges.length && manual.length) errors.push("Không giữ lời nào (wranges rỗng) thì manual cũng phải rỗng.");
  manual.forEach((cluster, ci) => {
    if (!Array.isArray(cluster) || !cluster.length) {
      errors.push(`manual[${ci}] phải là mảng 1–4 dòng chữ.`);
      return;
    }
    const lines = [];
    for (const rawLine of cluster) {
      const line = String(rawLine ?? "").replace(/\s+/g, " ").trim();
      const { n: cnt, txt, override } = lineWordCount(line);
      if (!line || !Number.isInteger(cnt) || cnt < 1 || !txt.trim()) {
        errors.push(`manual[${ci}]: dòng "${line}" không hợp lệ (cần ≥ 1 từ; "chữ|n" chỉ được 1 dấu |).`);
        continue;
      }
      if (!override) {
        const got = toks.slice(k, k + cnt);
        if (txt.split(/\s+/).map(norm).join(" ") !== got.map(norm).join(" ") && mismatches.length < 12) {
          mismatches.push(`cụm ${ci}: "${txt}" ≠ lời gốc "${got.join(" ")}"`);
        }
      }
      k += cnt;
      lines.push(line);
    }
    if (lines.length) plan.manual.push(lines);
  });
  if (k !== toks.length) {
    errors.push(
      `Tổng số từ trong manual (${k}) ≠ số từ trong wranges (${toks.length}). ` +
        (mismatches.length ? `Chỗ lệch đầu tiên: ${mismatches[0]}` : ""),
    );
  } else if (mismatches.length) {
    errors.push(`Chữ trong manual không khớp lời gốc (dùng "chữ|n" nếu cố ý sửa chữ): ${mismatches.slice(0, 5).join("; ")}`);
  }

  const nc = plan.manual.length;
  const tplMap = new Map(templates.map((t) => [t.name, t]));

  // BROLL — sai thì bỏ (không chặn cả video)
  plan.broll = [];
  for (const b of Array.isArray(raw.broll) ? raw.broll : []) {
    const from = Number(b?.from);
    const to = Number(b?.to);
    const tpl = tplMap.get(b?.template);
    if (!tpl) {
      warnings.push(`Bỏ B-roll "${b?.template}" (không có trong thư viện mẫu).`);
      continue;
    }
    if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to >= nc || from > to) {
      warnings.push(`Bỏ B-roll ${tpl.name} (cụm ${from}–${to} không hợp lệ).`);
      continue;
    }
    if (plan.broll.some((x) => !(to < x.from || from > x.to))) {
      warnings.push(`Bỏ B-roll ${tpl.name} (trùng cụm với B-roll khác).`);
      continue;
    }
    const params = {};
    for (const [key, val] of Object.entries(b.params ?? {})) {
      if (tpl.params.includes(key)) params[key] = val;
      else warnings.push(`B-roll ${tpl.name}: bỏ tham số lạ "${key}".`);
    }
    plan.broll.push({ from, to, template: tpl.name, params });
  }
  plan.broll.sort((a, b) => a.from - b.from);

  // BEHIND / DARK
  plan.behind = [];
  for (const x of Array.isArray(raw.behind) ? raw.behind : []) {
    const ci = Number(x?.cluster);
    const word = String(x?.word ?? "").trim();
    if (Number.isInteger(ci) && ci >= 0 && ci < nc && word && word.length <= 8 && !plan.behind.some((y) => y.cluster === ci)) {
      plan.behind.push({ cluster: ci, word });
    }
  }
  plan.dark = [...new Set((Array.isArray(raw.dark) ? raw.dark : []).map(Number))].filter(
    (ci) => Number.isInteger(ci) && ci >= 0 && ci < nc && !plan.behind.some((b) => b.cluster === ci),
  );

  plan.uncertain = (Array.isArray(raw.uncertain_words) ? raw.uncertain_words : [])
    .filter((u) => u && typeof u.heard === "string")
    .slice(0, 30)
    .map((u) => ({ heard: u.heard, guess: String(u.guess ?? ""), index: Number(u.word_index) }));
  plan.summary = typeof raw.summary === "string" ? raw.summary.slice(0, 600) : "";

  // HOOK: câu "móc" (chép lên đầu video) — sai thì bỏ, không chặn
  plan.hook = null;
  const hk = raw.hook;
  if (hk && typeof hk === "object") {
    const a = Number(hk.from_word);
    const b = Number(hk.to_word);
    const kept = new Set(widx);
    if (Number.isInteger(a) && Number.isInteger(b) && a <= b && b - a <= 35 && kept.has(a) && kept.has(b)) {
      // Câu móc đã nằm sẵn ở ~3 giây đầu thì khỏi chép
      if (widx.indexOf(a) > 8) plan.hook = { from: a, to: b, reason: String(hk.reason ?? "").slice(0, 160) };
    } else {
      warnings.push("Bỏ câu móc AI chọn (nằm ngoài đoạn giữ hoặc quá dài).");
    }
  }
  plan.grade = GRADES[raw.grade] ? raw.grade : null;

  return { plan, errors, warnings };
}

/** Bộ màu (FFmpeg) — "tu-nhien" = màu mặc định của engine */
export const GRADES = {
  "tu-nhien": null,
  "rung-tuoi": "eq=contrast=1.06:saturation=1.2:gamma=1.03,colorbalance=rs=-0.015:gs=0.03:bs=0.015:rh=0.015:bh=-0.01,vibrance=intensity=0.15",
  "hoang-hon": "eq=contrast=1.05:saturation=1.12:gamma=1.0,colorbalance=rs=0.045:gs=0.012:bs=-0.05:rm=0.035:bm=-0.035:rh=0.05:bh=-0.04",
  "dien-anh": "eq=contrast=1.1:saturation=0.9:gamma=0.98,colorbalance=rs=-0.04:bs=0.05:rm=0.015:bm=-0.015:rh=0.05:gh=0.01:bh=-0.045",
};
export const GRADE_LABELS = { "tu-nhien": "Tự nhiên", "rung-tuoi": "Rừng tươi", "hoang-hon": "Hoàng hôn ấm", "dien-anh": "Điện ảnh" };

// ───────────── Claude đọc SKILL.md và lên kịch bản ─────────────

const GRADES_ENUM = { "tu-nhien": 1, "rung-tuoi": 1, "hoang-hon": 1, "dien-anh": 1 };

const PLAN_TOOL = {
  name: "submit_plan",
  description: "Nộp kịch bản edit (tương đương nội dung du_an.py) cho video này.",
  input_schema: {
    type: "object",
    properties: {
      speed: { type: "number", description: "SPEED: nói nhanh (> ~4 từ/giây sau khi cắt) 1.1, nói chậm 1.2" },
      wranges: {
        type: "array",
        description: "WRANGES: các đoạn GIỮ theo số thứ tự từ [đầu, cuối] (gồm cả 2 đầu), tăng dần, không chồng nhau",
        items: { type: "array", items: { type: "integer" }, minItems: 2, maxItems: 2 },
      },
      manual: {
        type: "array",
        description: 'MANUAL: mỗi phần tử = 1 cụm (2–4 dòng). Tiền tố "*" chữ mảnh nhấn, "!" chữ dày nhấn, "chữ|n" khi sửa chữ nghe sai / gộp n từ',
        items: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 4 },
      },
      broll: {
        type: "array",
        description: "BROLL: from/to = SỐ CỤM (chỉ số trong mảng manual, bắt đầu từ 0)",
        items: {
          type: "object",
          properties: {
            from: { type: "integer" },
            to: { type: "integer" },
            template: { type: "string" },
            params: { type: "object" },
          },
          required: ["from", "to", "template", "params"],
        },
      },
      behind: {
        type: "array",
        description: "BEHIND: chữ to sau đầu 3–5 lần, từ ngắn 2–5 ký tự",
        items: {
          type: "object",
          properties: { cluster: { type: "integer" }, word: { type: "string" } },
          required: ["cluster", "word"],
        },
      },
      dark: { type: "array", description: "DARK: số cụm xoá phông nền tối (~8–10 cụm rải đều)", items: { type: "integer" } },
      scenes: {
        type: "array",
        description:
          "SCENES: đoạn KHÔNG có lời nhưng hình đáng giữ (phong cảnh, hành động, khoảnh khắc, cảnh dẫn chuyện) — giây theo video nguồn. " +
          "Đoạn này giữ nguyên, không bị cắt khoảng lặng.",
        items: {
          type: "object",
          properties: { start: { type: "number" }, end: { type: "number" }, reason: { type: "string" } },
          required: ["start", "end", "reason"],
        },
      },
      uncertain_words: {
        type: "array",
        description: "Chữ nghe sai / phải đoán (tên riêng, thuật ngữ) để báo người dùng xác nhận",
        items: {
          type: "object",
          properties: { word_index: { type: "integer" }, heard: { type: "string" }, guess: { type: "string" } },
          required: ["heard", "guess"],
        },
      },
      summary: { type: "string", description: "1–2 câu tiếng Việt tóm tắt cách edit (đã cắt gì, minh hoạ gì)" },
      hook: {
        type: "object",
        description:
          "CÂU MÓC chép lên ĐẦU video (cold open, 2–4 giây): câu gây tò mò / bất ngờ / có con số nhất trong phần lời ĐÃ GIỮ. Bỏ trống nếu câu mở đầu đã đủ hút.",
        properties: {
          from_word: { type: "integer", description: "số thứ tự từ đầu câu (phải nằm trong wranges)" },
          to_word: { type: "integer", description: "số thứ tự từ cuối câu (≤ 35 từ sau from_word)" },
          reason: { type: "string" },
        },
        required: ["from_word", "to_word"],
      },
      grade: {
        type: "string",
        enum: Object.keys(GRADES_ENUM),
        description: "Bộ màu hợp cảnh nhất: tu-nhien | rung-tuoi (rừng, cây, hồ xanh) | hoang-hon (nắng chiều, ánh ấm) | dien-anh (trầm, tương phản)",
      },
    },
    required: ["speed", "wranges", "manual", "broll", "behind", "dark", "scenes", "uncertain_words", "summary"],
  },
};

function webContext(templates) {
  return `

---
## BỐI CẢNH: ĐANG CHẠY TRONG WEB APP (không phải Claude Code)
Bạn KHÔNG chạy được lệnh. Web app đã gỡ băng, trích sẵn KHUNG HÌNH đều nhau của cả video (kèm mốc giây) để bạn XEM, và sẽ tự làm bước 6–9 (chạy khô, dựng nháp/bản chính, mix).
Việc của bạn: làm đúng bước 3–5 của quy trình (chọn đoạn giữ, chia cụm MANUAL, gán BROLL / BEHIND / DARK, chọn SPEED) + chọn SCENES, rồi nộp qua tool submit_plan.

CHỌN ĐOẠN GIỮ BẰNG CẢ HÌNH LẪN LỜI — KHÔNG phải cứ im lặng là cắt:
- Lời nói: như skill (bỏ câu vấp/lặp, ậm ừ, lan man) → wranges + manual.
- Đoạn KHÔNG LỜI: xem khung hình. Cảnh đẹp / có ý nghĩa (phong cảnh, đường đi, hành động đang làm, khoảnh khắc cảm xúc, cảnh mở/kết, cảnh minh hoạ cho câu vừa nói) → GIỮ bằng scenes [{start, end, reason}] (giây theo video nguồn). Mỗi đoạn thường 1,5–6 s; khoảng lặng dài thì lấy phần đẹp/ổn định nhất. Có thể đặt cảnh không lời ở đầu video làm mở màn.
- BỎ đoạn không lời vô nghĩa: hình tối đen, rung lắc mạnh, che ống kính, chĩa xuống đất, lặp lại cảnh đã giữ, đang loay hoay chuẩn bị quay.
- Clip KHÔNG có lời nào (video nhiều clip) thường là cảnh minh hoạ người dùng cố ý quay → giữ phần đẹp nhất của clip đó.
- Video ghép từ nhiều clip thì đoạn giữ đi theo thứ tự thời gian của video nguồn.
- Trong lúc chạy scenes, phụ đề tự ẩn.

Quy tắc bắt buộc của web:
1. SỐ CỤM = chỉ số trong mảng manual (bắt đầu từ 0) — chính là số mà "--list" sẽ in ra.
2. Tổng số từ của manual phải KHỚP CHÍNH XÁC tổng số từ trong wranges, theo đúng thứ tự (đếm như soat_cum.py: dòng có "|n" tính n từ; dòng khác đếm số từ cách nhau bởi dấu cách; bỏ ký tự đánh dấu * và ! ở đầu). Chữ trong dòng phải giống lời gốc, trừ dòng dùng "|n".
3. Mỗi dòng chỉ được tối đa một dấu "|". Không bắt đầu dòng bằng "*" hay "!" trừ khi muốn nhấn.
4. PHONG CÁCH HIỆN TẠI (người dùng đã chốt): KHÔNG dùng B-roll minh hoạ 3D, KHÔNG xoá phông / nền tối, KHÔNG chữ to sau đầu → luôn để broll = [], behind = [], dark = []. Video luôn giữ phông thật; sức hút đến từ nhịp cắt, cảnh không lời đẹp và phụ đề kiểu TikTok font DT Phudu (chữ hiện TỪNG TỪ đúng lúc nói).
   NHẤN TỪ KHOÁ màu CAM: tách từ khoá thành DÒNG RIÊNG có "*" (chữ cam to) — giá tiền ("*500 nghìn"), địa danh ("*Đà Giang", "*Hồ Mắt Ngọc"), con số ("*3 sai lầm", "*1 ngày"), tên tour; "!" (hộp cam chữ trắng) cho câu kêu gọi mạnh ("!Đặt tour ngay"). Khoảng 1 từ khoá / 2–3 cụm, đừng nhấn tràn lan.
5. Không có câu hỏi lại người dùng: chữ nào phải đoán thì ghi vào uncertain_words.
6. Video không có lời nào → wranges = [], manual = [], chỉ dùng scenes.
7. CÂU MÓC (hook): người xem TikTok quyết định ở lại trong 1–2 giây đầu. Chọn 1 câu NGẮN (2–4 giây) gây tò mò nhất trong phần lời đã giữ (câu hỏi, con số, điều bất ngờ, lời hứa kết quả) → web app chép câu đó lên đầu video rồi mới chạy video từ đầu. Nếu câu mở đầu đã là câu móc thì bỏ trống hook. Đồng thời, nếu có cảnh không lời thật ấn tượng, có thể đặt nó trong scenes ngay đầu video.
8. grade: chọn bộ màu hợp không khí khung hình.

`;
}

/** Lời nhắn gửi Claude: chữ + (nếu có) các khung hình kèm mốc giây */
function buildContent(userText, frames, forced, toolName = PLAN_TOOL.name) {
  const hint = forced ? "" : `\n\nBẮT BUỘC: trả kết quả bằng cách gọi tool ${toolName} (không viết kịch bản ra dạng chữ).`;
  if (!frames.length) return userText + hint;
  const content = [{ type: "text", text: userText }];
  content.push({ type: "text", text: `\nKHUNG HÌNH của video nguồn (${frames.length} khung, mốc giây ghi trước mỗi ảnh):` });
  for (const f of frames) {
    content.push({ type: "text", text: `t = ${f.t.toFixed(1)}s` });
    content.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: f.data } });
  }
  content.push({ type: "text", text: "Xem hình + lời rồi nộp kịch bản." + hint });
  return content;
}

/** Model nào từ chối tool_choice ép buộc thì nhớ lại, lần sau gọi thẳng "auto" */
const noForcedTool = new Set();

/** Lấy object JSON đầu tiên (cân ngoặc) trong câu trả lời dạng chữ — dự phòng khi Claude không gọi tool */
export function extractJson(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const src = fenced ? fenced[1] : text;
  const start = src.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  let inStr = false;
  for (let i = start; i < src.length; i++) {
    const ch = src[i];
    if (inStr) {
      if (ch === "\\") i++;
      else if (ch === '"') inStr = false;
    } else if (ch === '"') inStr = true;
    else if (ch === "{") depth++;
    else if (ch === "}" && --depth === 0) {
      try {
        return JSON.parse(src.slice(start, i + 1));
      } catch {
        return null;
      }
    }
  }
  return null;
}

/** Gọi Claude với 1 tool bắt buộc; trả về input của tool (export để montage dùng chung) */
export async function callClaude({ system, userText, frames = [], signal, tool: toolDef = PLAN_TOOL, accept = (p) => p.manual || p.scenes }) {
  const { anthropicApiKey, anthropicModel } = config.skill;
  const forced = !noForcedTool.has(anthropicModel);

  const timeout = AbortSignal.timeout(5 * 60 * 1000);
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": anthropicApiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: anthropicModel,
      max_tokens: 16000,
      system,
      tools: [toolDef],
      // Một số model (vd đang bật suy luận) không nhận tool_choice ép buộc → dùng "auto" + dặn trong lời nhắn
      tool_choice: forced ? { type: "tool", name: toolDef.name } : { type: "auto" },
      messages: [{ role: "user", content: buildContent(userText, frames, forced, toolDef.name) }],
    }),
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    if (forced && res.status === 400 && body.includes("tool_choice")) {
      noForcedTool.add(anthropicModel);
      return callClaude({ system, userText, frames, signal, tool: toolDef, accept }); // gọi lại với tool_choice "auto"
    }
    throw new Error(`Claude API lỗi ${res.status}: ${body.slice(0, 300)}`);
  }

  const data = await res.json();
  const tool = data.content?.find((c) => c.type === "tool_use" && c.name === toolDef.name);
  if (tool) return tool.input;

  // Dự phòng: Claude viết kịch bản ra chữ thay vì gọi tool
  const text = (data.content ?? []).filter((c) => c.type === "text").map((c) => c.text).join("\n");
  const parsed = extractJson(text);
  if (parsed && accept(parsed)) return parsed;
  if (data.stop_reason === "max_tokens") throw new Error("Kịch bản quá dài, Claude bị cắt giữa chừng (max_tokens).");
  throw new Error("Claude không trả về kịch bản.");
}

export const claudeEnabled = () => Boolean(config.skill.anthropicApiKey);

/** Claude lên kịch bản; lệch thì gửi lại lỗi cho Claude tự sửa (tối đa 3 lần) */
export async function planWithClaude({ skillMd, templates, words, pauses, duration, clips = [], frames = [], signal, onAttempt }) {
  const system = skillMd + webContext(templates);
  const clipInfo =
    clips.length > 1
      ? `Video nguồn ghép từ ${clips.length} clip theo thứ tự:\n${clips.map((c, i) => `  clip ${i + 1} "${c.name}": ${c.start.toFixed(1)}s → ${c.end.toFixed(1)}s`).join("\n")}\n`
      : "";
  const intro =
    `Video dọc dài ${duration.toFixed(1)} giây, ${words.length} từ${words.length ? ` (chỉ số 0–${words.length - 1})` : " (KHÔNG có lời)"}.\n` +
    clipInfo +
    `Lời đã gỡ băng (định dạng liet_ke.py: từ(số thứ tự:giây), [n] = số câu):\n\n${formatTranscript(words) || "(không có)"}\n\n` +
    `Khoảng nghỉ (giây bắt đầu, độ dài): ${JSON.stringify(pauses.map((p) => [p.s, p.d]))}\n\n` +
    `Hãy edit video này theo skill và nộp kịch bản qua submit_plan.`;

  let userText = intro;
  let lastErrors = [];
  for (let attempt = 1; attempt <= 3; attempt++) {
    onAttempt?.(attempt);
    // Lần đầu gửi kèm khung hình; lần sửa lỗi chỉ gửi chữ (scenes đã chọn nằm trong kịch bản cũ) cho đỡ tốn
    const raw = await callClaude({ system, userText, frames: attempt === 1 ? frames : [], signal });
    const result = validatePlan(raw, words, templates, { duration });
    if (!result.errors.length) return { ...result, attempts: attempt };
    lastErrors = result.errors;
    userText =
      intro +
      `\n\nKịch bản lần trước của bạn bị lỗi khi kiểm tra (soat_cum):\n- ${result.errors.join("\n- ")}\n\n` +
      `Kịch bản lần trước (để bạn sửa, GIỮ NGUYÊN scenes nếu không sai):\n${JSON.stringify(raw).slice(0, 30000)}\n\nHãy sửa và nộp lại toàn bộ kịch bản.`;
  }
  throw new Error(`Kịch bản của Claude vẫn lỗi sau 3 lần: ${lastErrors[0]}`);
}

// ───────────── Kịch bản tự động (khi không có Claude) ─────────────

const FILLERS = new Set(["à", "ừ", "ờ", "ừm", "ờm", "ơ", "ậm", "hmm", "uhm", "um", "uh", "ừa"]);
const hasDigit = (s) => /\d/.test(s);
const cleanLine = (words) => {
  const txt = words.map((w) => w.x).join(" ");
  // Ký tự có ý nghĩa đặc biệt trong MANUAL → dùng dạng "chữ|n"
  if (/^[*!]|\|/.test(txt)) return `${txt.replace(/[|*!]/g, "").trim() || "…"}|${words.length}`;
  return txt;
};

/**
 * Đoạn không lời đáng giữ — khi KHÔNG có Claude để xem hình:
 * mỗi khoảng không lời ≥ 2s trong từng clip giữ phần giữa (≤ 4s); clip không có lời nào giữ ≤ 5s ở giữa.
 * Tổng không quá ~40% video.
 */
export function heuristicScenes(words, { duration, clips = [] }) {
  const list = clips.length ? clips : [{ start: 0, end: duration }];
  const cands = [];
  for (const c of list) {
    const inClip = words.filter((w) => w.s >= c.start && w.e <= c.end);
    if (!inClip.length) {
      const len = Math.min(5, c.end - c.start - 0.6);
      if (len >= 1.5) {
        const mid = (c.start + c.end) / 2;
        cands.push({ start: mid - len / 2, end: mid + len / 2, gap: 99, reason: "clip không lời" });
      }
      continue;
    }
    const edges = [c.start, ...inClip.flatMap((w) => [w.s, w.e]), c.end];
    for (let i = 0; i < edges.length; i += 2) {
      const a = edges[i];
      const b = edges[i + 1];
      const gap = b - a;
      if (gap < 2) continue;
      const len = Math.min(4, gap - 0.6);
      const mid = (a + b) / 2;
      cands.push({ start: mid - len / 2, end: mid + len / 2, gap, reason: "khoảng không lời dài" });
    }
  }
  const budget = duration * 0.4;
  let used = 0;
  const kept = [];
  for (const c of [...cands].sort((x, y) => y.gap - x.gap)) {
    if (used + (c.end - c.start) > budget) continue;
    used += c.end - c.start;
    kept.push({ start: c.start, end: c.end, reason: c.reason });
  }
  return kept.sort((x, y) => x.start - y.start);
}

export function heuristicPlan(words, pauses, { duration = 0, clips = [] } = {}) {
  // 1. Bỏ từ đệm đứng riêng ("à", "ừ"…)
  const wranges = [];
  let start = null;
  words.forEach((w, i) => {
    const filler = FILLERS.has(norm(w.x));
    if (!filler && start === null) start = i;
    if (filler && start !== null) {
      wranges.push([start, i - 1]);
      start = null;
    }
  });
  if (start !== null) wranges.push([start, words.length - 1]);
  const kept = widxFromRanges(wranges).map((i) => words[i]);

  // 2. Chia cụm: ngắt ở dấu câu / khoảng nghỉ ≥ 0.45s / tối đa 8 từ; mỗi cụm 1–3 dòng, mỗi dòng ≤ 3 từ
  const pauseAfter = (w) => pauses.some((p) => p.s >= w.e - 0.05 && p.s <= w.e + 0.2 && p.d >= 0.45);
  const clusters = [];
  let cur = [];
  kept.forEach((w, idx) => {
    cur.push(w);
    const next = kept[idx + 1];
    const gap = next && next.i !== w.i + 1; // chỗ bị cắt
    if (cur.length >= 8 || /[.!?…,;:]$/.test(w.x) || pauseAfter(w) || gap || !next) {
      clusters.push(cur);
      cur = [];
    }
  });
  if (cur.length) clusters.push(cur);

  const manual = clusters.map((cw, ci) => {
    const lines = [];
    for (let j = 0; j < cw.length; j += 3) lines.push(cw.slice(j, j + 3));
    // Gộp dòng cuối 1 từ vào dòng trước cho đỡ lẻ
    if (lines.length > 1 && lines.at(-1).length === 1 && lines.at(-2).length < 4) lines.at(-2).push(...lines.pop());
    return lines.map((lw, li) => {
      const txt = cleanLine(lw);
      if (txt.includes("|")) return txt;
      if (lw.some((w) => hasDigit(w.x)) && lw.length <= 3) return `!${txt}`; // số → chữ dày nhấn
      if (li === lines.length - 1 && lines.length > 1 && lw.length <= 2 && ci % 3 === 1) return `*${txt}`; // chữ mảnh nhấn
      return txt;
    });
  });

  // 3. Nền: chữ sau đầu cho số ngắn (≤ 4 lần), nền tối rải đều ~1/8 cụm
  const behind = [];
  clusters.forEach((cw, ci) => {
    const w = cw.find((x) => {
      const len = x.x.replace(/[^\p{L}\p{N}%]/gu, "").length;
      return hasDigit(x.x) && len >= 2 && len <= 5; // skill: từ ngắn 2–5 ký tự
    });
    if (w && behind.length < 4 && (!behind.length || ci - behind.at(-1).cluster >= 6)) {
      behind.push({ cluster: ci, word: w.x.replace(/[^\p{L}\p{N}%]/gu, "").toUpperCase() });
    }
  });
  // Nền tối gom thành đoạn 2 cụm liền nhau (ít lần đổi nền → chuyển cảnh mượt), ~1 đoạn / 12 cụm
  const runs = Math.min(5, Math.max(1, Math.round(clusters.length / 12)));
  const dark = [];
  const nearBehind = (ci) => behind.some((b) => Math.abs(b.cluster - ci) <= 1);
  for (let j = 0; j < runs; j++) {
    const ci = Math.round(((j + 0.5) * clusters.length) / runs);
    for (const x of [ci, ci + 1]) if (x < clusters.length && !nearBehind(x)) dark.push(x);
  }

  // 4. B-roll: con số lớn → bộ đếm BCount (≤ 1 lần / 10 cụm)
  const broll = [];
  clusters.forEach((cw, ci) => {
    const numWord = cw.find((x) => /^\d[\d.,]*$/.test(x.x.replace(/[^\d.,]/g, "")) && Number(x.x.replace(/\D/g, "")) >= 10);
    if (!numWord || (broll.length && ci - broll.at(-1).from < 10) || behind.some((b) => b.cluster === ci)) return;
    const target = Number(numWord.x.replace(/\D/g, ""));
    const pos = cw.indexOf(numWord);
    const label = cw.slice(pos + 1, pos + 3).map((w) => w.x.replace(/[^\p{L}\p{N}]/gu, "")).join(" ").toUpperCase();
    const top = cw.slice(Math.max(0, pos - 3), pos).map((w) => w.x).join(" ");
    broll.push({ from: ci, to: ci, template: "BCount", params: { target, top: top || " ", label: label || " ", suffix: "" } });
  });

  // 5. Tốc độ: nói nhanh (> 4 từ/giây) → 1.1, chậm → 1.2
  const talk = kept.reduce((s, w) => s + (w.e - w.s), 0);
  const speed = kept.length / Math.max(1, talk + kept.length * 0.08) > 4 ? 1.1 : 1.2;

  return {
    speed,
    wranges,
    manual,
    broll: [], // phong cách hiện tại: không B-roll 3D, không tách phông
    behind: [],
    dark: [],
    scenes: heuristicScenes(words, { duration, clips }),
    uncertain_words: [],
    summary:
      "Kịch bản tự động (chưa có Claude): bỏ từ đệm, chia cụm theo nhịp nói, nhấn các con số, giữ phần giữa các khoảng không lời dài.",
  };
}

// ───────────── Ghi du_an.py ─────────────

/** Đổi giá trị JS → literal Python (chuỗi dùng JSON.stringify — hợp lệ trong Python 3, UTF-8) */
export function toPy(v) {
  if (v === null || v === undefined) return "None";
  if (v === true) return "True";
  if (v === false) return "False";
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "None";
  if (typeof v === "string") return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(toPy).join(", ")}]`;
  if (typeof v === "object") return `{${Object.entries(v).map(([k, x]) => `${JSON.stringify(k)}: ${toPy(x)}`).join(", ")}}`;
  return "None";
}

export function buildDuAnPy(
  plan,
  { src, outName = "reel", music = [], matte = "rvm", transition = "muot", outRes = [1080, 1920], phude = "tung-tu", accent = [255, 122, 26], hook = true, grade = null },
) {
  const manual = plan.manual.map((c, ci) => `    ${toPy(c)},  # ${ci}`).join("\n");
  const broll = plan.broll.map((b) => `    (${b.from}, ${b.to}, ${toPy(b.template)}, ${toPy(b.params)}),`).join("\n");
  const behind = plan.behind.map((b) => `${b.cluster}: ${toPy(b.word)}`).join(", ");
  return `# -*- coding: utf-8 -*-
# Tạo tự động bởi web app VIDEO AI (skill reel-doc-3d). Có thể sửa tay rồi dựng lại.
# ${plan.summary.replace(/\n/g, " ")}

SRC = ${toPy(src)}
SPEED = ${plan.speed}
OUT_RES = (${outRes[0]}, ${outRes[1]})
MUSIC = ${toPy(music)}
OUT_NAME = ${toPy(outName)}
MATTE = ${toPy(matte)}
FONT_CHU = "phudu"   # phụ đề DT Phudu ("inter" = kiểu cũ Inter Tight + Playfair)
BROLL_3D = False     # True = bật lại mẫu minh hoạ khối 3D
TACH_PHONG = False   # True = bật lại nền tối xoá phông (DARK) + chữ to sau đầu (BEHIND)
CHUYEN_CANH = ${toPy(transition)}  # "muot" (zoom từ từ, hoà tan, không chớp trắng) | "manh" (kiểu cũ)
PHU_DE = ${toPy(phude)}  # "tung-tu" (kiểu TikTok: hiện từng từ) | "cum" (kiểu cũ)
MAU_NHAN = (${accent.join(", ")})  # màu chữ nhấn / hộp nhấn
HOOK = ${hook && plan.hook ? `(${plan.hook.from}, ${plan.hook.to})  # câu móc: ${String(plan.hook.reason ?? "").replace(/\n/g, " ")}` : "None"}
${grade ? `GRADE = ${toPy(grade)}  # bộ màu` : "# GRADE = mặc định"}

WRANGES = ${toPy(plan.wranges)}

MANUAL = [
${manual}
]

BROLL = [
${broll}
]
BEHIND = {${behind}}
DARK = set(${toPy(plan.dark)})

# Đoạn KHÔNG LỜI giữ lại (giây theo video nguồn): (đầu, cuối, "lý do")
SCENES = [
${(plan.scenes ?? []).map((sc) => `    (${sc.start}, ${sc.end}, ${toPy(sc.reason)}),`).join("\n")}
]
`;
}
