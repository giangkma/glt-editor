/**
 * Sound effect "vừa đủ, không lố":
 *  - whoosh nhẹ ở những chỗ cắt bỏ khoảng lặng DÀI (chuyển ý)
 *  - pop nhỏ khi hiện chữ nhấn mạnh (có số, câu hỏi, cảm thán)
 *  - giãn cách tối thiểu giữa các hiệu ứng + giới hạn tổng số
 *
 * Âm thanh được tự tạo bằng code (không cần FFmpeg) lần đầu chạy → assets/sfx/*.wav.
 * Muốn dùng âm thanh riêng: thay file whoosh.wav / pop.wav cùng tên.
 */

export const SFX_NAMES = ["whoosh", "pop"];
const SR = 48000;

/** PRNG cố định → lần nào tạo cũng ra đúng một âm */
function rng(seed) {
  let x = seed >>> 0 || 1;
  return () => {
    x ^= x << 13; x >>>= 0;
    x ^= x >>> 17;
    x ^= x << 5; x >>>= 0;
    return x / 4294967296;
  };
}
const qsin = (u) => Math.sin((Math.PI / 2) * Math.min(1, Math.max(0, u)));

/** Mẫu âm thanh (mono, -1..1) của từng hiệu ứng */
function synth(name) {
  if (name === "whoosh") {
    // Tiếng gió lướt: nhiễu hồng → lọc 400–5000 Hz, vào/ra mềm, tần số quét lên nhẹ
    const n = Math.round(0.5 * SR);
    const rand = rng(7);
    const out = new Float32Array(n);
    let b0 = 0, b1 = 0, b2 = 0, hp = 0, hpPrev = 0, lp = 0;
    for (let i = 0; i < n; i++) {
      const t = i / SR;
      const w = rand() * 2 - 1;
      b0 = 0.99765 * b0 + w * 0.099046; // nhiễu hồng (Paul Kellet, rút gọn)
      b1 = 0.963 * b1 + w * 0.2965164;
      b2 = 0.57 * b2 + w * 1.0526913;
      const pink = (b0 + b1 + b2 + w * 0.1848) * 0.18;
      const aHp = Math.exp((-2 * Math.PI * 400) / SR);
      hp = aHp * (hp + pink - hpPrev); hpPrev = pink;
      const fc = 2500 + 2500 * (t / 0.5); // lọc mở dần → cảm giác "vút" lên
      const aLp = 1 - Math.exp((-2 * Math.PI * fc) / SR);
      lp += aLp * (hp - lp);
      const env = t < 0.3 ? qsin(t / 0.3) : qsin((0.5 - t) / 0.2);
      out[i] = lp * env;
    }
    return normalize(out, 0.5);
  }
  if (name === "pop") {
    // Tiếng "bóp" ngắn: sin quét tần từ 2000 → 500 Hz, tắt nhanh
    const n = Math.round(0.18 * SR);
    const out = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const t = i / SR;
      const f = 500 + 1500 * Math.exp(-t * 45);
      const fade = t > 0.12 ? Math.max(0, 1 - (t - 0.12) / 0.06) : 1;
      out[i] = 0.9 * Math.sin(2 * Math.PI * f * t) * Math.exp(-t * 28) * fade;
    }
    return out;
  }
  throw new Error(`Không có SFX "${name}"`);
}

function normalize(x, peak) {
  let m = 0;
  for (const v of x) m = Math.max(m, Math.abs(v));
  if (m > 0) for (let i = 0; i < x.length; i++) x[i] = (x[i] / m) * peak;
  return x;
}

/** File WAV 48kHz, 16-bit, stereo */
export function sfxWav(name) {
  const mono = synth(name);
  const data = Buffer.alloc(mono.length * 4);
  mono.forEach((v, i) => {
    const s16 = Math.max(-32768, Math.min(32767, Math.round(v * 32767)));
    data.writeInt16LE(s16, i * 4);
    data.writeInt16LE(s16, i * 4 + 2);
  });
  const h = Buffer.alloc(44);
  h.write("RIFF", 0); h.writeUInt32LE(36 + data.length, 4); h.write("WAVE", 8);
  h.write("fmt ", 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(2, 22);
  h.writeUInt32LE(SR, 24); h.writeUInt32LE(SR * 4, 28); h.writeUInt16LE(4, 32); h.writeUInt16LE(16, 34);
  h.write("data", 36); h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
}

/** Âm lượng tương đối so với giọng nói (giọng đã chuẩn hoá -14 LUFS) */
export const SFX_GAIN = { whoosh: 0.35, pop: 0.3 };
/** Đặt hiệu ứng sớm hơn mốc một chút để "vào" đúng nhịp */
const LEAD_SEC = { whoosh: 0.2, pop: 0.03 };

export function planSfx({ segments, captions = [], duration }) {
  const candidates = [];

  // Chỗ cắt có khoảng lặng bị bỏ ≥ 1 giây → coi là chuyển ý
  for (let i = 1; i < segments.length; i++) {
    const removed = segments[i].start - segments[i - 1].end;
    const t = segments[i].outStart;
    if (removed >= 1.0 && t > 1.5 && t < duration - 1) {
      candidates.push({ type: "whoosh", time: t - LEAD_SEC.whoosh, weight: removed });
    }
  }

  // Cụm chữ nhấn mạnh
  for (const c of captions) {
    if (c.emphasis && c.start > 0.8 && c.start < duration - 0.5) {
      candidates.push({ type: "pop", time: c.start - LEAD_SEC.pop, weight: 1 });
    }
  }

  candidates.sort((a, b) => a.time - b.time);

  const MIN_GAP_SAME = { whoosh: 7, pop: 5 };
  const MIN_GAP_ANY = 2;
  const maxEvents = Math.max(1, Math.floor(duration / 6));

  const events = [];
  const lastByType = {};
  for (const c of candidates) {
    const last = events.at(-1);
    if (last && c.time - last.time < MIN_GAP_ANY) continue;
    if (lastByType[c.type] !== undefined && c.time - lastByType[c.type] < MIN_GAP_SAME[c.type]) continue;
    events.push({ type: c.type, time: Math.max(0, c.time) });
    lastByType[c.type] = c.time;
    if (events.length >= maxEvents) break;
  }
  return events;
}
