/**
 * Video KHÔNG LỜI → montage theo nhạc (skill: nhip_nhac.py + montage_engine.py).
 *  - Thư viện nhạc của skill: nhac/<tên>_full.wav + _grid.json (điểm vào) + _nhip.json (tempo, nhịp, độ sôi động)
 *  - Claude XEM khung hình + đọc "tính chất" từng bài → chọn bài hợp nhất, chọn cảnh đẹp, số nhịp cho từng cảnh
 *  - Không có Claude → montage tự động (chia đều cảnh, mỗi cảnh 2 nhịp)
 */
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { runPython } from "./python.js";
import { callClaude } from "./planner.js";

/** Có phải video không lời không: gần như không có chữ, hoặc lời chiếm < 8% thời lượng */
export function isVoiceless(words, duration) {
  const speech = words.reduce((s, w) => s + Math.max(0, w.e - w.s), 0);
  return words.length < 6 || speech < duration * 0.08;
}

/** Đọc thư viện nhạc (phân tích nhịp cho bài nào chưa có) */
export async function loadTracks(skillDirPath, python, { signal } = {}) {
  const nhac = path.join(skillDirPath, "nhac");
  const files = existsSync(nhac) ? await fs.readdir(nhac) : [];
  const names = files.filter((f) => f.endsWith("_grid.json")).map((f) => f.replace(/_grid\.json$/, ""));
  if (names.some((n) => !existsSync(path.join(nhac, `${n}_nhip.json`)))) {
    const scripts = path.join(skillDirPath, "scripts");
    await runPython(python, [path.join(scripts, "nhip_nhac.py"), "--all"], { cwd: scripts, signal, label: "nhip_nhac" });
  }
  const tracks = [];
  for (const name of names) {
    try {
      const grid = JSON.parse(await fs.readFile(path.join(nhac, `${name}_grid.json`), "utf8"));
      const nhip = JSON.parse(await fs.readFile(path.join(nhac, `${name}_nhip.json`), "utf8"));
      const entry = Number(grid.entry) || 0;
      const beatsAfter = nhip.beats.filter((b) => b >= entry - 0.05);
      // Độ sôi động theo từng ô nhịp (4 nhịp) kể từ điểm vào — để AI dựng cao trào theo nhạc
      const step = nhip.energy_step || 0.5;
      const bars = [];
      for (let i = 0; i + 4 < beatsAfter.length && bars.length < 48; i += 4) {
        const a = Math.floor(beatsAfter[i] / step);
        const b = Math.max(a + 1, Math.floor(beatsAfter[i + 4] / step));
        const seg = nhip.energy.slice(a, b);
        bars.push(Math.round((seg.reduce((s, x) => s + x, 0) / Math.max(1, seg.length)) * 9));
      }
      tracks.push({
        name,
        bpm: nhip.tempo,
        beatSec: 60 / nhip.tempo,
        mood: nhip.mood,
        beatsAvailable: Math.max(0, beatsAfter.length - 1),
        secondsAvailable: beatsAfter.length > 1 ? beatsAfter.at(-1) - beatsAfter[0] : 0,
        barEnergy: bars,
      });
    } catch {
      /* bài lỗi → bỏ qua */
    }
  }
  return tracks;
}

const MONTAGE_TOOL = {
  name: "submit_montage",
  description: "Nộp kịch bản montage theo nhạc (nội dung montage.json) cho video không lời.",
  input_schema: {
    type: "object",
    properties: {
      music: { type: "string", description: "Tên bài nhạc trong thư viện" },
      shots: {
        type: "array",
        description: "Các cảnh theo thứ tự xuất hiện. start = giây bắt đầu lấy trong video nguồn; beats = số nhịp nhạc cảnh chiếm (1–8); speed 0.5–2 (<1 = quay chậm)",
        items: {
          type: "object",
          properties: {
            start: { type: "number" },
            beats: { type: "integer" },
            speed: { type: "number" },
            reason: { type: "string" },
          },
          required: ["start", "beats", "reason"],
        },
      },
      ambient: { type: "number", description: "Luôn 0 — video chill tắt hẳn tiếng gốc" },
      summary: { type: "string", description: "1–2 câu tiếng Việt: chọn bài nào, vì sao, dựng theo mạch nào" },
      grade: {
        type: "string",
        enum: ["tu-nhien", "rung-tuoi", "hoang-hon", "dien-anh"],
        description: "Bộ màu hợp cảnh: rung-tuoi (rừng, cây, hồ xanh) | hoang-hon (nắng chiều, ánh ấm) | dien-anh (trầm, tương phản) | tu-nhien",
      },
    },
    required: ["music", "shots", "summary"],
  },
};

const MONTAGE_CONTEXT = `

---
## BỐI CẢNH: VIDEO KHÔNG LỜI → MONTAGE THEO NHẠC (web app)
Video này (1 hoặc nhiều clip ghép) gần như không có lời nói. Hãy dựng một montage đẹp theo nhạc nền, nộp qua tool submit_montage.
- Chọn bài nhạc trong thư viện hợp với KHÔNG KHÍ hình ảnh (núi rừng/hùng vĩ → nhịp vừa, ấm; năng động/đường phố → nhanh, sáng; bình yên/hoàng hôn → chậm, êm). Nếu người dùng đã chỉ định bài thì dùng đúng bài đó.
- Mỗi cảnh chiếm số NHỊP nguyên (cắt luôn rơi đúng beat): đoạn nhạc êm → 4–8 nhịp, có thể quay chậm (speed 0.6–0.8) cho cảnh đẹp; đoạn sôi động → 1–2 nhịp, cắt dồn. Dựa vào "độ sôi động từng ô nhịp" để đặt cao trào. Tổng số nhịp KHÔNG vượt số nhịp còn lại của bài.
- Chọn khoảnh khắc ĐẸP NHẤT của mỗi cảnh (ổn định, rõ, có chuyển động tự nhiên); bỏ đoạn rung lắc, mờ, tối, chĩa xuống đất, che ống kính; không lặp cùng một cảnh.
- Mạch dựng: mở bằng cảnh toàn/thiết lập không gian → các cảnh chi tiết, hành động → cao trào khi nhạc mạnh → kết bằng cảnh rộng, êm. Có thể đảo thứ tự clip nếu kể chuyện hay hơn.
- Độ dài: tận dụng tư liệu đẹp, thường 12–45 giây; video nguồn ngắn thì montage ngắn, đừng kéo dài bằng cảnh xấu.
- start tính bằng giây theo video nguồn (xem mốc giây trước mỗi khung hình). Cảnh cần đủ tư liệu: beats × giây/nhịp × speed (+0,2s) tính từ start.
- ambient luôn = 0: video chill TẮT hẳn tiếng gốc, chỉ còn nhạc (người dùng đã chốt).
- Nhạc là linh hồn của video chill: chọn bài khớp cảm xúc của hình (tempo, độ sôi động, âm sắc), không chỉ "bài đầu danh sách".
- KHÔNG chèn chữ / tiêu đề / POV nào lên video chill — chỉ hình + nhạc (người dùng đã chốt).
- CẢNH MÓC (bắt buộc): cảnh ĐẦU TIÊN phải là khoảnh khắc "wow" ấn tượng nhất của cả tư liệu (đỉnh núi, hồ xanh, biển mây, cú nhảy, toàn cảnh choáng ngợp) — 2–3 nhịp, KHÔNG mở bằng cảnh đi bộ bình thường. Người xem TikTok quyết định ở lại trong 1–2 giây đầu. Cảnh móc có thể dùng lại một phần ở cuối làm cao trào nhưng không lặp y nguyên.
- QUAY CHẬM: nếu nguồn quay 60 khung/giây (xem dòng "fps" ở trên) → khoảnh khắc chuyển động đẹp (nước chảy, tóc/cờ bay, nhảy qua suối, sóng) dùng speed 0.5 cho mượt; nguồn 30fps thì chậm nhất 0.7.
- grade: chọn bộ màu hợp không khí khung hình.
- Nhịp tham khảo từ video mẫu người dùng thích: mỗi cảnh ~1,2–4,5 giây, cắt thẳng đúng phách, mở bằng cảnh "hero" ấn tượng, kết bằng cảnh rộng giơ tay / ngắm cảnh, màu tươi ấm.`;

export function validateMontage(raw, { duration, tracks, fixedMusic, fps = 30 }) {
  const minSpeed = fps >= 50 ? 0.5 : 0.7;
  const errors = [];
  const name = fixedMusic ?? raw?.music;
  const track = tracks.find((t) => t.name === name) ?? (fixedMusic ? null : tracks[0]);
  if (!track) errors.push(`Không có bài nhạc "${name}".`);
  const shots = [];
  let beatsUsed = 0;
  for (const sh of Array.isArray(raw?.shots) ? raw.shots : []) {
    const beats = Math.round(Number(sh?.beats));
    const speed = Number.isFinite(Number(sh?.speed)) ? Math.min(2, Math.max(minSpeed, Number(sh.speed))) : 1;
    let start = Number(sh?.start);
    if (!Number.isFinite(start) || !(beats >= 1 && beats <= 8)) continue;
    start = Math.min(Math.max(0, start), Math.max(0, duration - 0.3));
    if (track && beatsUsed + beats > track.beatsAvailable) break;
    beatsUsed += beats;
    shots.push({ start: Math.round(start * 100) / 100, beats, speed, reason: String(sh?.reason ?? "").slice(0, 120) });
  }
  if (shots.length < 2) errors.push("Montage cần ít nhất 2 cảnh hợp lệ.");
  return {
    plan: {
      music: track?.name ?? null,
      shots,
      ambient: 0, // video chill: tắt hẳn tiếng gốc
      summary: typeof raw?.summary === "string" ? raw.summary.slice(0, 600) : "",
      title: "", // video chill: không chèn chữ
      grade: ["tu-nhien", "rung-tuoi", "hoang-hon", "dien-anh"].includes(raw?.grade) ? raw.grade : null,
    },
    errors,
    seconds: track ? beatsUsed * track.beatSec : 0,
  };
}

function describeTracks(tracks) {
  return tracks
    .map(
      (t) =>
        `- "${t.name}": ${t.bpm.toFixed(0)} BPM (${t.beatSec.toFixed(2)} s/nhịp), ${t.mood.nhip}, ${t.mood.do_soi_dong}, âm sắc ${t.mood.am_sac}; ` +
        `còn ${t.beatsAvailable} nhịp (~${Math.round(t.secondsAvailable)}s) từ điểm vào; độ sôi động từng ô 4 nhịp (0–9): ${t.barEnergy.join(" ")}`,
    )
    .join("\n");
}

export async function planMontageWithClaude({ skillMd, frames, clips, duration, tracks, fixedMusic, signal, fps = 30 }) {
  const system = skillMd + MONTAGE_CONTEXT;
  const clipInfo = clips.length > 1
    ? `Ghép từ ${clips.length} clip:\n${clips.map((c, i) => `  clip ${i + 1} "${c.name}": ${c.start.toFixed(1)}s → ${c.end.toFixed(1)}s`).join("\n")}\n`
    : "";
  const intro =
    `Video nguồn dài ${duration.toFixed(1)} giây, không có lời nói, ${Math.round(fps)} fps${fps >= 50 ? " (quay chậm 0.5 vẫn mượt)" : ""}.\n${clipInfo}\n` +
    `Thư viện nhạc nền:\n${describeTracks(tracks)}\n` +
    (fixedMusic ? `\nNgười dùng ĐÃ CHỌN bài "${fixedMusic}" → music = "${fixedMusic}".\n` : "\nHãy tự chọn bài hợp nhất.\n");

  let userText = intro;
  for (let attempt = 1; attempt <= 2; attempt++) {
    const raw = await callClaude({
      system,
      userText,
      frames: attempt === 1 ? frames : [],
      signal,
      tool: MONTAGE_TOOL,
      accept: (p) => Array.isArray(p.shots),
    });
    const result = validateMontage(raw, { duration, tracks, fixedMusic, fps });
    if (!result.errors.length) return result;
    userText = `${intro}\nKịch bản lần trước lỗi: ${result.errors.join("; ")}\nKịch bản lần trước: ${JSON.stringify(raw).slice(0, 20000)}\nHãy sửa và nộp lại.`;
  }
  throw new Error("Claude không lên được montage hợp lệ.");
}

/** Montage tự động: chọn bài, chia tư liệu thành cảnh 2–4 nhịp lấy đều từ mọi clip */
export function heuristicMontage({ duration, clips, tracks, fixedMusic }) {
  const track = tracks.find((t) => t.name === fixedMusic) ?? tracks[0];
  const list = clips.length ? clips : [{ start: 0, end: duration }];
  const target = Math.min(track.secondsAvailable, Math.max(8, Math.min(30, duration * 0.6)));
  const totalBeats = Math.max(4, Math.floor(target / track.beatSec));
  const shots = [];
  let used = 0;
  // Đi lần lượt TỪNG clip (giữ mạch kể theo thứ tự quay), mỗi clip được phần nhịp tỉ lệ với độ dài;
  // cảnh rải đều trong clip, bỏ 0,4s đầu/cuối (thường rung). Cảnh đầu & cuối dài hơn (mở / kết).
  const totalLen = list.reduce((s, c) => s + (c.end - c.start), 0) || 1;
  list.forEach((c, ci) => {
    const share = ci === list.length - 1 ? totalBeats - used : Math.round((totalBeats * (c.end - c.start)) / totalLen);
    let budget = Math.max(0, share);
    const usable = c.end - c.start - 0.8;
    if (usable < 2 * track.beatSec || budget < 2) return;
    const plan = [];
    while (budget >= 2) {
      const beats = plan.length === 0 && ci === 0 ? 4 : budget >= 6 && plan.length % 2 === 1 ? 4 : 2;
      plan.push(Math.min(beats, budget));
      budget -= Math.min(beats, budget);
    }
    const gap = Math.max(0, (usable - plan.reduce((s, b) => s + b * track.beatSec + 0.2, 0)) / plan.length);
    let cur = c.start + 0.4;
    for (const beats of plan) {
      const need = beats * track.beatSec + 0.2;
      if (cur + need > c.end - 0.4) break;
      shots.push({ start: Math.round(cur * 100) / 100, beats, speed: 1, reason: `tự động (clip ${ci + 1})` });
      used += beats;
      cur += need + gap;
    }
  });
  return validateMontage({ music: track.name, shots, ambient: 0, summary: `Montage tự động theo nhạc "${track.name}".` }, { duration, tracks, fixedMusic });
}
