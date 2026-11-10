/**
 * BỘ VẼ HIỆU ỨNG DÙNG CHUNG — chạy y hệt ở trình duyệt (xem trước trong Studio) và ở server
 * (@napi-rs/canvas khi xuất video) → thấy sao xuất vậy.
 * File JS thuần, không phụ thuộc thư viện nào; chỉ dùng Canvas 2D chuẩn (không dùng ctx.filter vì Safari chưa có).
 *
 * Toạ độ: x, y = 0..1 theo khung; kích thước tính theo đơn vị u = cạnh ngắn / 1080.
 * Phong cách: chuyển động nhẹ (0,25–0,5 s, ease-out), lệch ít, mờ dần — sinh động nhưng không giật.
 */

export const FONTS = {
  phudu: { family: "Phudu", weight: 800, style: "normal", label: "DT Phudu" },
  inter: { family: "Inter Tight", weight: 800, style: "normal", label: "Inter Tight (đậm)" },
  serif: { family: "Playfair Display", weight: 600, style: "italic", label: "Playfair (nghiêng)" },
};
export const ICONS = ["check", "cross", "star", "heart", "arrow", "sparkle", "fire"];

const FALLBACK = '"Arial", sans-serif';
/** Bản cố định từng độ đậm (server đăng ký tên "Phudu 800"…; trình duyệt không có tên đó → tự dùng bản biến thiên "Phudu") */
const STATIC_WEIGHTS = { phudu: [500, 700, 800], inter: [500, 600, 800], serif: [600, 700] };
export const fontCss = (key, px, weight) => {
  const f = FONTS[key] ?? FONTS.phudu;
  const w = weight ?? f.weight;
  const near = (STATIC_WEIGHTS[key] ?? STATIC_WEIGHTS.phudu).reduce((a, b) => (Math.abs(b - w) < Math.abs(a - w) ? b : a));
  return `${f.style === "italic" ? "italic " : ""}${w} ${Math.max(1, px).toFixed(1)}px "${f.family} ${near}", "${f.family}", ${FALLBACK}`;
};

// ───────────────────────── tiện ích ─────────────────────────
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const easeOut = (x) => 1 - Math.pow(1 - clamp(x), 3);
const easeInOut = (x) => ((x = clamp(x)), x * x * (3 - 2 * x));
const easeBack = (x, k = 1.6) => ((x = clamp(x)), 1 + (k + 1) * Math.pow(x - 1, 3) + k * Math.pow(x - 1, 2));

function rrect(ctx, x, y, w, h, r) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
function shadow(ctx, blur, alpha = 0.45, dy = 0) {
  ctx.shadowColor = `rgba(0,0,0,${alpha})`;
  ctx.shadowBlur = blur;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = dy;
}
function noShadow(ctx) {
  ctx.shadowColor = "rgba(0,0,0,0)";
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
}
/** Độ hiện (vào / ra) của 1 phần tử */
function presence(it, t, inDur = 0.35, outDur = 0.3) {
  const p = easeOut((t - it.start) / inDur);
  const q = easeOut((it.end - t) / outDur);
  return { p, q, a: Math.min(p, q) };
}
/** Tách "chữ *nhấn* chữ" thành các đoạn */
export function runsOf(text) {
  const out = [];
  String(text ?? "")
    .split(/(\*[^*]+\*)/)
    .forEach((s) => {
      if (!s) return;
      if (s.startsWith("*") && s.endsWith("*") && s.length > 2) out.push({ s: s.slice(1, -1), em: true });
      else out.push({ s, em: false });
    });
  return out;
}

/** Thời gian xuất hiện (giây) — phần tử đang/không hiện ở t */
export const isActive = (it, t) => !it.hidden && t >= it.start - 0.02 && t <= it.end + 0.02;

// ───────────────────────── PHỤ ĐỀ (từng từ) ─────────────────────────
const CAP_SIZE = { lead: 86, sub: 66, cam: 106, hop: 84 };

function drawCaption(ctx, it, t, W, H, u, st) {
  const fontKey = it.font ?? st.captionFont ?? "phudu";
  const accent = it.accent ?? st.accent ?? "#ff7a1a";
  const color = it.color ?? "#ffffff";
  const k = (it.scale ?? 1) * (st.captionSize ?? 1);
  const q = easeOut((it.end + 0.12 - t) / 0.18); // mờ dần khi hết cụm
  const lines = (it.lines ?? []).map((ln) => {
    const px = (CAP_SIZE[ln.kind] ?? 70) * u * k;
    ctx.font = fontCss(fontKey, px);
    const words = (ln.words?.length ? ln.words : [{ w: ln.text, t: it.start }]).map((w) => ({ ...w, width: ctx.measureText(w.w).width }));
    const gap = ctx.measureText(" ").width;
    const width = words.reduce((s, w) => s + w.width, 0) + gap * Math.max(0, words.length - 1);
    const fit = Math.min(1, (W * 0.88) / Math.max(1, width + (ln.kind === "hop" ? px * 0.7 : 0)));
    return { ...ln, px: px * fit, words: words.map((w) => ({ ...w, width: w.width * fit })), gap: gap * fit, width: width * fit };
  });
  const lh = (L) => L.px * (L.kind === "hop" ? 1.42 : 1.16);
  const total = lines.reduce((s, L) => s + lh(L), 0);
  const cx = (it.x ?? 0.5) * W;
  const bottom = (it.y ?? st.captionY ?? 0.8) * H;
  let y = bottom - total;
  ctx.save();
  ctx.globalAlpha = q;
  for (const L of lines) {
    const mid = y + lh(L) / 2;
    ctx.font = fontCss(fontKey, L.px);
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    ctx.lineJoin = "round";
    let x = cx - L.width / 2;
    if (L.kind === "hop") {
      const t0 = L.words[0]?.t ?? it.start;
      const u2 = easeOut((t - t0 + 0.04) / 0.18);
      if (u2 > 0) {
        ctx.save();
        shadow(ctx, 18 * u, 0.3, 6 * u);
        ctx.fillStyle = accent;
        const bx = x - L.px * 0.32, bw = (L.width + L.px * 0.64) * u2, bh = L.px * 1.24;
        rrect(ctx, bx, mid - bh / 2, bw, bh, L.px * 0.22);
        ctx.fill();
        ctx.restore();
      }
    }
    for (const w of L.words) {
      const wt = t - (w.t - 0.03);
      if (wt > 0) {
        const p = clamp(wt / 0.16);
        const sc = p < 1 ? 0.74 + 0.26 * easeBack(p, 2) : 1;
        ctx.save();
        ctx.globalAlpha = q * clamp(p * 2.5);
        ctx.translate(x + w.width / 2, mid - (1 - easeOut(p)) * 10 * u);
        ctx.scale(sc, sc);
        const fill = L.kind === "cam" ? accent : L.kind === "hop" ? "#ffffff" : color;
        if (L.kind !== "hop") {
          shadow(ctx, L.px * 0.22, 0.5, L.px * 0.05);
          ctx.strokeStyle = "rgba(10,10,14,0.88)";
          ctx.lineWidth = L.px * 0.13;
          ctx.strokeText(w.w, -w.width / 2, 0);
          noShadow(ctx);
        }
        ctx.fillStyle = fill;
        ctx.fillText(w.w, -w.width / 2, 0);
        ctx.restore();
      }
      x += w.width + L.gap;
    }
    y += lh(L);
  }
  ctx.restore();
  const bw = Math.max(...lines.map((L) => L.width + L.px * 0.7), 10);
  return { cx, cy: bottom - total / 2, w: bw, h: total + 10 * u, rot: 0 };
}

// ───────────────────────── TIÊU ĐỀ (gõ dần từng chữ) ─────────────────────────
const EM_SCALE = 1.16; // chữ nhấn to hơn

function measureRuns(ctx, runs, px, fontKey) {
  return runs.map((r) => {
    ctx.font = fontCss(fontKey, r.em ? px * EM_SCALE : px, 800);
    const chars = [...r.s].map((c) => ({ c, w: ctx.measureText(c).width }));
    // khoảng chữ hơi khít cho chữ khối (giống tiêu đề TikTok)
    const track = fontKey === "serif" ? 0 : -px * 0.02;
    const width = chars.reduce((s, c) => s + c.w + track, 0) - track;
    return { ...r, chars, track, width };
  });
}

function drawTitle(ctx, it, t, W, H, u, st) {
  const fontKey = it.font ?? "phudu"; // DT Phudu là font chủ đạo
  const px = (it.size ?? 118) * u * (it.scale ?? 1);
  const color = it.color ?? "#ffffff";
  // Màu chữ nhấn: mặc định = màu nhấn chung (cam) — tím nhạt cũ chìm trên nền lá cây
  const accent = it.accent ?? (st.emphasis && st.emphasis !== "#c4a5ff" ? st.emphasis : st.accent ?? "#ff7a1a");
  const { q } = presence(it, t, 0.3, 0.3);
  const cx = (it.x ?? 0.5) * W;
  const cy = (it.y ?? 0.2) * H;
  const align = it.align ?? "center";
  const lines = String(it.text ?? "").split("\n").map((ln) => measureRuns(ctx, runsOf(ln), px, fontKey));
  const widths = lines.map((rs) => rs.reduce((s, r) => s + r.width, 0));
  let maxW = Math.max(1, ...widths);
  const fit = Math.min(1, (W * 0.92) / maxW);
  const hasEm = lines.some((rs) => rs.some((r) => r.em));
  const lh = px * (hasEm ? 1.14 : 1.02) * fit;
  const subPx = px * 0.4 * fit;
  const hasSub = Boolean(it.sub);
  const totalH = lh * lines.length + (hasSub ? subPx * 1.5 : 0);
  let y0 = cy - totalH / 2 + lh / 2;
  const nChars = lines.reduce((s, rs) => s + rs.reduce((a, r) => a + r.chars.length, 0), 0);
  const per = Math.min(0.045, 0.6 / Math.max(1, nChars));
  let ci = 0;
  ctx.save();
  ctx.globalAlpha = q;
  ctx.translate(0, -(1 - q) * 14 * u);
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  lines.forEach((runs, li) => {
    const lw = widths[li] * fit;
    let x = align === "left" ? cx : cx - lw / 2;
    const y = y0 + li * lh;
    for (const r of runs) {
      const fpx = (r.em ? px * EM_SCALE : px) * fit;
      ctx.font = fontCss(fontKey, fpx, 800);
      ctx.lineJoin = "round";
      for (const ch of r.chars) {
        const ct = t - it.start - ci * per;
        // chữ nhấn hiện sau một nhịp, NẢY lên (to → vừa) để gây chú ý
        const p = clamp((r.em ? ct - 0.08 : ct) / (r.em ? 0.36 : 0.28));
        if (p > 0) {
          ctx.save();
          ctx.globalAlpha = q * easeOut(Math.min(1, p * 1.6));
          const yy = y + (r.em ? 0 : (1 - easeOut(p)) * px * 0.32);
          const cxch = x + (ch.w * fit) / 2;
          if (r.em) {
            const sc = p < 1 ? 1.45 - 0.45 * easeBack(p, 2.6) : 1;
            ctx.translate(cxch, yy);
            ctx.scale(sc, sc);
            ctx.translate(-cxch, -yy);
            // quầng sáng cùng màu + viền tối dày → nổi hẳn trên mọi nền
            ctx.shadowColor = accent;
            ctx.shadowBlur = fpx * 0.45;
            ctx.strokeStyle = "rgba(12,12,16,0.92)";
            ctx.lineWidth = fpx * 0.16;
            ctx.strokeText(ch.c, x, yy);
            noShadow(ctx);
            shadow(ctx, fpx * 0.14, 0.55, fpx * 0.05);
            ctx.fillStyle = accent;
            ctx.fillText(ch.c, x, yy);
          } else {
            shadow(ctx, fpx * 0.2, 0.5, fpx * 0.04);
            ctx.strokeStyle = "rgba(12,12,16,0.75)";
            ctx.lineWidth = fpx * 0.08;
            ctx.strokeText(ch.c, x, yy);
            noShadow(ctx);
            ctx.fillStyle = color;
            ctx.fillText(ch.c, x, yy);
          }
          ctx.restore();
        }
        x += (ch.w + r.track) * fit;
        ci++;
      }
    }
  });
  if (hasSub) {
    const sp = easeOut((t - it.start - nChars * per - 0.05) / 0.35);
    if (sp > 0) {
      ctx.save();
      ctx.globalAlpha = q * sp;
      ctx.font = fontCss(fontKey === "serif" ? "serif" : "phudu", subPx, 600);
      const sw = ctx.measureText(it.sub).width;
      const sy = y0 + lines.length * lh - lh / 2 + subPx * 1.05 + (1 - sp) * 10 * u;
      const sx = align === "left" ? cx + px * 0.4 : cx - sw / 2;
      ctx.lineJoin = "round";
      shadow(ctx, subPx * 0.4, 0.55, subPx * 0.06);
      ctx.strokeStyle = "rgba(12,12,16,0.7)";
      ctx.lineWidth = subPx * 0.14;
      ctx.strokeText(it.sub, sx, sy);
      noShadow(ctx);
      ctx.fillStyle = it.subColor ?? "rgba(255,255,255,0.97)";
      ctx.fillText(it.sub, sx, sy);
      ctx.restore();
    }
  }
  ctx.restore();
  return { cx: align === "left" ? cx + maxW * fit / 2 : cx, cy, w: maxW * fit + 20 * u, h: totalH + 16 * u, rot: 0 };
}

// ───────────────────────── ICON tự vẽ nét ─────────────────────────
function pathLen(pts) {
  let s = 0;
  for (let i = 1; i < pts.length; i++) s += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  return s;
}
function strokePts(ctx, pts, p) {
  const L = pathLen(pts);
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.setLineDash([L, L]);
  ctx.lineDashOffset = L * (1 - clamp(p));
  ctx.stroke();
  ctx.setLineDash([]);
}
const ICON_COLORS = { check: "#22c55e", cross: "#ef4444", star: "#ffc23d", heart: "#ff5b8a", arrow: "#ffffff", sparkle: "#ffe58a", fire: "#ff7a1a" };

function drawIcon(ctx, it, t, W, H, u, st, _images, local) {
  const S = (it.size ?? 150) * u * (it.scale ?? 1);
  const color = it.color ?? ICON_COLORS[it.icon] ?? st.accent ?? "#ff7a1a";
  const { q } = presence(it, t, 0.3, 0.3);
  const e = t - it.start;
  const cx = local ? 0 : (it.x ?? 0.78) * W;
  const cy = local ? 0 : (it.y ?? 0.42) * H;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.globalAlpha *= q;
  const pop = e < 0.3 ? 0.6 + 0.4 * easeBack(e / 0.3, 2) : 1;
  ctx.scale(pop, pop);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  shadow(ctx, S * 0.12, 0.35, S * 0.03);
  const r = S / 2;
  const lw = S * 0.11;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = lw;
  const circle = (p) => {
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.9, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 - 0.001) * easeInOut(p)); // 2π tròn có máy vẽ thành rỗng
    ctx.stroke();
  };
  switch (it.icon) {
    case "cross": {
      strokePts(ctx, [[-r * 0.6, -r * 0.6], [r * 0.6, r * 0.6]], easeOut(e / 0.22));
      strokePts(ctx, [[r * 0.6, -r * 0.6], [-r * 0.6, r * 0.6]], easeOut((e - 0.18) / 0.22));
      break;
    }
    case "star": {
      const pts = [];
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        const rr = i % 2 ? r * 0.42 : r * 0.95;
        pts.push([Math.cos(a) * rr, Math.sin(a) * rr]);
      }
      ctx.rotate((1 - easeOut(e / 0.5)) * -0.6 + Math.sin(e * 2) * 0.04);
      ctx.beginPath();
      pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.closePath();
      ctx.fill();
      break;
    }
    case "heart": {
      const b = 1 + Math.sin(e * 5) * 0.04;
      ctx.scale(b, b);
      ctx.beginPath();
      ctx.moveTo(0, r * 0.8);
      ctx.bezierCurveTo(-r * 1.3, -r * 0.1, -r * 0.55, -r * 1.05, 0, -r * 0.42);
      ctx.bezierCurveTo(r * 0.55, -r * 1.05, r * 1.3, -r * 0.1, 0, r * 0.8);
      ctx.fill();
      break;
    }
    case "arrow": {
      const pts = [];
      for (let i = 0; i <= 20; i++) {
        const s = i / 20;
        pts.push([-r * 0.9 + s * r * 1.6, r * 0.5 - Math.sin(s * Math.PI) * r * 0.9]);
      }
      strokePts(ctx, pts, easeOut(e / 0.45));
      if (e > 0.4) {
        ctx.globalAlpha *= easeOut((e - 0.4) / 0.15);
        const [x, y] = pts[pts.length - 1];
        strokePts(ctx, [[x - r * 0.42, y - r * 0.12], [x, y], [x - r * 0.12, y - r * 0.42]], 1);
      }
      break;
    }
    case "sparkle": {
      const tw = 0.85 + Math.sin(e * 6) * 0.15;
      ctx.scale(tw, tw);
      ctx.rotate(e * 0.4);
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = (i * Math.PI) / 4;
        const rr = i % 2 ? r * 0.22 : r * 0.95;
        const [x, y] = [Math.cos(a) * rr, Math.sin(a) * rr];
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.closePath();
      ctx.fill();
      break;
    }
    case "fire": {
      const f = 1 + Math.sin(e * 9) * 0.03;
      ctx.scale(f, 1 / f);
      ctx.beginPath();
      ctx.moveTo(0, -r);
      ctx.bezierCurveTo(r * 0.9, -r * 0.2, r * 0.75, r * 0.85, 0, r * 0.9);
      ctx.bezierCurveTo(-r * 0.75, r * 0.85, -r * 0.9, -r * 0.1, -r * 0.2, -r * 0.45);
      ctx.bezierCurveTo(-r * 0.1, -r * 0.1, r * 0.1, -r * 0.5, 0, -r);
      ctx.fill();
      ctx.fillStyle = "#ffd36b";
      ctx.beginPath();
      ctx.ellipse(0, r * 0.45, r * 0.32, r * 0.42, 0, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    default: {
      // check: vòng tròn vẽ dần rồi dấu tích
      circle(e / 0.35);
      strokePts(ctx, [[-r * 0.42, r * 0.02], [-r * 0.1, r * 0.34], [r * 0.48, -r * 0.3]], easeOut((e - 0.3) / 0.25));
    }
  }
  ctx.restore();
  return { cx, cy, w: S * 1.1, h: S * 1.1, rot: 0 };
}

// ───────────────────────── THẺ THÔNG TIN ─────────────────────────
function wrapText(ctx, text, maxW) {
  const out = [];
  for (const para of String(text ?? "").split("\n")) {
    let line = "";
    for (const w of para.split(" ")) {
      const test = line ? `${line} ${w}` : w;
      if (ctx.measureText(test).width > maxW && line) {
        out.push(line);
        line = w;
      } else line = test;
    }
    out.push(line);
  }
  return out;
}

function drawCard(ctx, it, t, W, H, u, st) {
  const navy = (it.theme ?? "navy") === "navy";
  const accent = it.accent ?? (navy ? "#5ef2c2" : st.accent ?? "#ff7a1a");
  const k = it.scale ?? 1;
  const cw = (it.w ?? 0.78) * W * k;
  const pad = 34 * u * k;
  const iconS = it.icon ? 96 * u * k : 0;
  const tPx = 50 * u * k;
  const sPx = 32 * u * k;
  const textW = cw - pad * 2 - (iconS ? iconS + pad * 0.7 : 0);
  ctx.font = fontCss("phudu", tPx);
  const tl = wrapText(ctx, String(it.title ?? "").toLocaleUpperCase("vi"), textW);
  ctx.font = fontCss("phudu", sPx, 500);
  const sl = it.sub ? wrapText(ctx, it.sub, textW) : [];
  const ch = Math.max(iconS, tl.length * tPx * 1.1 + (sl.length ? sl.length * sPx * 1.3 + sPx * 0.4 : 0)) + pad * 2;
  const { p, q } = presence(it, t, 0.42, 0.3);
  const cx = (it.x ?? 0.5) * W;
  const cy = (it.y ?? 0.36) * H;
  ctx.save();
  ctx.globalAlpha = Math.min(p, q);
  ctx.translate(cx, cy + (1 - p) * 46 * u - (1 - q) * 10 * u);
  ctx.rotate(((it.rotate ?? 0) * Math.PI) / 180);
  const x0 = -cw / 2, y0 = -ch / 2;
  shadow(ctx, 40 * u, 0.45, 14 * u);
  if (navy) {
    const g = ctx.createLinearGradient(0, y0, 0, y0 + ch);
    g.addColorStop(0, "rgba(22,36,82,0.95)");
    g.addColorStop(1, "rgba(10,18,44,0.95)");
    ctx.fillStyle = g;
  } else ctx.fillStyle = "rgba(255,255,255,0.96)";
  rrect(ctx, x0, y0, cw, ch, 30 * u * k);
  ctx.fill();
  noShadow(ctx);
  ctx.lineWidth = 2 * u;
  ctx.strokeStyle = navy ? "rgba(120,170,255,0.38)" : "rgba(0,0,0,0.08)";
  ctx.stroke();
  let tx = x0 + pad;
  if (iconS) {
    ctx.save();
    ctx.translate(tx + iconS / 2, 0);
    ctx.fillStyle = navy ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.05)";
    rrect(ctx, -iconS / 2, -iconS / 2, iconS, iconS, iconS * 0.28);
    ctx.fill();
    drawIcon(ctx, { ...it, icon: it.icon, size: (iconS / u) * 0.6, scale: 1, start: it.start + 0.25, color: it.iconColor ?? accent }, t, W, H, u, st, null, true);
    ctx.restore();
    tx += iconS + pad * 0.7;
  }
  ctx.textBaseline = "top";
  ctx.textAlign = "left";
  let ty = -((tl.length * tPx * 1.1 + (sl.length ? sl.length * sPx * 1.3 + sPx * 0.4 : 0)) / 2);
  ctx.font = fontCss("phudu", tPx);
  ctx.fillStyle = accent;
  for (const l of tl) {
    ctx.fillText(l, tx, ty);
    ty += tPx * 1.1;
  }
  if (sl.length) {
    ty += sPx * 0.4;
    const sp = easeOut((t - it.start - 0.25) / 0.35);
    ctx.globalAlpha *= sp;
    ctx.font = fontCss("phudu", sPx, 500);
    ctx.fillStyle = navy ? "rgba(255,255,255,0.78)" : "rgba(30,40,60,0.75)";
    for (const l of sl) {
      ctx.fillText(l, tx, ty);
      ty += sPx * 1.3;
    }
  }
  ctx.restore();
  return { cx, cy, w: cw, h: ch, rot: ((it.rotate ?? 0) * Math.PI) / 180 };
}

// ───────────────────────── THẺ PHỤ ĐỀ BO GÓC (gõ chữ) ─────────────────────────
function drawPill(ctx, it, t, W, H, u, st) {
  const blue = it.theme === "blue";
  const k = it.scale ?? 1;
  const px = 50 * u * k;
  const text = String(it.text ?? "");
  const pf = it.font ?? "phudu";
  ctx.font = fontCss(pf, px, 700);
  const full = ctx.measureText(text).width;
  const maxW = W * 0.86;
  const fit = Math.min(1, maxW / (full + px * 1.6));
  const fpx = px * fit;
  ctx.font = fontCss(pf, fpx, 700);
  const tw = ctx.measureText(text).width;
  const pw = tw + fpx * 1.6;
  const ph = fpx * 1.9;
  const { p, q } = presence(it, t, 0.3, 0.3);
  const cx = (it.x ?? 0.5) * W;
  const cy = (it.y ?? 0.66) * H;
  ctx.save();
  ctx.globalAlpha = Math.min(p, q);
  ctx.translate(cx, cy);
  ctx.rotate(((it.rotate ?? 0) * Math.PI) / 180);
  ctx.scale(1, 0.7 + 0.3 * easeBack(p, 1.4));
  shadow(ctx, 30 * u, blue ? 0.35 : 0.28, 10 * u);
  if (blue) {
    const g = ctx.createLinearGradient(-pw / 2, 0, pw / 2, 0);
    g.addColorStop(0, "#2f7cf6");
    g.addColorStop(1, "#5aa8ff");
    ctx.fillStyle = g;
    rrect(ctx, -pw / 2, -ph / 2, pw, ph, ph / 2);
  } else {
    const g = ctx.createLinearGradient(0, -ph / 2, 0, ph / 2);
    g.addColorStop(0, "#f4f8ff");
    g.addColorStop(1, "#dfeafb");
    ctx.fillStyle = g;
    rrect(ctx, -pw / 2, -ph / 2, pw, ph, fpx * 0.42);
  }
  ctx.fill();
  noShadow(ctx);
  if (!blue) {
    ctx.lineWidth = 2.5 * u;
    ctx.strokeStyle = "#b7cdf0";
    ctx.stroke();
  }
  // Gõ chữ dần
  const chars = [...text];
  const dur = Math.min(1.2, chars.length * 0.045);
  const n = Math.ceil(chars.length * clamp((t - it.start - 0.15) / Math.max(0.2, dur)));
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  ctx.fillStyle = it.color ?? (blue ? "#ffffff" : "#1d2b4f");
  ctx.fillText(chars.slice(0, n).join(""), -tw / 2, fpx * 0.04);
  // Lấp lánh nhỏ ở góc khi gõ xong
  if (n >= chars.length) {
    const e = t - it.start - 0.15 - dur;
    ctx.save();
    ctx.translate(pw / 2 - fpx * 0.1, -ph / 2 + fpx * 0.1);
    drawIcon(ctx, { icon: "sparkle", size: (fpx / u) * 0.9, start: it.start + 0.15 + dur, end: it.end, color: blue ? "#ffffff" : "#ffc23d" }, t, W, H, u, st, null, true);
    ctx.restore();
    void e;
  }
  ctx.restore();
  return { cx, cy, w: pw, h: ph, rot: ((it.rotate ?? 0) * Math.PI) / 180 };
}

// ───────────────────────── ẢNH MINH HOẠ NỔI ─────────────────────────
function drawImage(ctx, it, t, W, H, u, st, images) {
  const img = images?.get?.(it.src);
  const k = it.scale ?? 1;
  const iw = (it.w ?? 0.6) * W * k;
  const ratio = img && img.width ? img.height / img.width : 0.75;
  const ih = iw * ratio;
  const { p, q } = presence(it, t, 0.5, 0.3);
  const e = t - it.start;
  const rot = ((it.rotate ?? -3) * Math.PI) / 180;
  const cx = (it.x ?? 0.5) * W + (1 - p) * W * 0.12;
  const cy = (it.y ?? 0.32) * H + Math.sin(e * 1.4) * 4 * u; // trôi nhẹ
  const border = (it.border ?? 10) * u * k;
  const radius = (it.radius ?? 28) * u * k;
  ctx.save();
  ctx.globalAlpha = Math.min(p, q);
  ctx.translate(cx, cy);
  ctx.rotate(rot + (1 - p) * 0.12);
  shadow(ctx, 44 * u, 0.45, 16 * u);
  ctx.fillStyle = "#ffffff";
  rrect(ctx, -iw / 2 - border, -ih / 2 - border, iw + border * 2, ih + border * 2, radius + border);
  ctx.fill();
  noShadow(ctx);
  rrect(ctx, -iw / 2, -ih / 2, iw, ih, radius);
  ctx.save();
  ctx.clip();
  if (img && img.width) ctx.drawImage(img, -iw / 2, -ih / 2, iw, ih);
  else {
    ctx.fillStyle = "#cfd8e6";
    ctx.fillRect(-iw / 2, -ih / 2, iw, ih);
  }
  ctx.restore();
  ctx.restore();
  return { cx, cy, w: iw + border * 2, h: ih + border * 2, rot };
}

// ───────────────────────── VẼ 1 KHUNG ─────────────────────────
const DRAW = { caption: drawCaption, title: drawTitle, icon: drawIcon, card: drawCard, pill: drawPill, image: drawImage };

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} tl   timeline { style, items }
 * @param {number} t    giây
 * @param {number} W
 * @param {number} H
 * @param {{ images?: Map<string, any>, selected?: string|null, onlyId?: string }} [opts]
 * @returns {Array<{id:string,cx:number,cy:number,w:number,h:number,rot:number}>} khung các phần tử đang hiện
 */
export function drawFrame(ctx, tl, t, W, H, opts = {}) {
  const u = Math.min(W, H) / 1080;
  const st = tl.style ?? {};
  const boxes = [];
  const items = (tl.items ?? []).filter((it) => isActive(it, t) && (it.type !== "caption" || st.captions !== false));
  // Thứ tự lớp: ảnh → thẻ → tiêu đề → icon → thẻ phụ đề → phụ đề (chữ luôn nằm trên)
  const order = { image: 0, card: 1, title: 2, icon: 3, pill: 4, caption: 5 };
  items.sort((a, b) => (order[a.type] ?? 9) - (order[b.type] ?? 9) || a.start - b.start);
  for (const it of items) {
    const fn = DRAW[it.type];
    if (!fn) continue;
    ctx.save();
    try {
      const b = fn(ctx, it, t, W, H, u, st, opts.images);
      if (b) boxes.push({ id: it.id, ...b });
    } finally {
      ctx.restore();
    }
  }
  if (opts.selected) {
    const b = boxes.find((x) => x.id === opts.selected);
    if (b) {
      ctx.save();
      ctx.translate(b.cx, b.cy);
      ctx.rotate(b.rot);
      ctx.setLineDash([10 * u, 7 * u]);
      ctx.lineWidth = Math.max(1.5, 3 * u);
      ctx.strokeStyle = "rgba(198,255,61,0.95)";
      ctx.strokeRect(-b.w / 2, -b.h / 2, b.w, b.h);
      ctx.restore();
    }
  }
  return boxes;
}

/** Phần tử dưới điểm (px, py) — ưu tiên lớp trên cùng */
export function hitTest(boxes, px, py) {
  for (let i = boxes.length - 1; i >= 0; i--) {
    const b = boxes[i];
    const dx = px - b.cx, dy = py - b.cy;
    const c = Math.cos(-b.rot), s = Math.sin(-b.rot);
    const lx = dx * c - dy * s, ly = dx * s + dy * c;
    if (Math.abs(lx) <= b.w / 2 && Math.abs(ly) <= b.h / 2) return b;
  }
  return null;
}

/** Các khoảng thời gian có hiệu ứng (để server chỉ vẽ khi cần) */
export function activeRanges(tl) {
  const r = (tl.items ?? [])
    .filter((it) => !it.hidden && (it.type !== "caption" || tl.style?.captions !== false))
    .map((it) => [it.start - 0.05, it.end + 0.35])
    .sort((a, b) => a[0] - b[0]);
  const out = [];
  for (const x of r) {
    if (out.length && x[0] <= out[out.length - 1][1]) out[out.length - 1][1] = Math.max(out[out.length - 1][1], x[1]);
    else out.push([...x]);
  }
  return out;
}
