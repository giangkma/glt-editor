"use client";

import { useEffect, useRef, useState } from "react";
import { drawFrame, ICONS } from "@/lib/overlay/render";
import { captionText, fmtTime, ICON_NAME, itemLabel, uploadAsset, type FontKey, type Item, type ItemType, type Timeline, type TimelineStyle } from "@/lib/studio";
import { ColorDot, Ico, ICO, inputCls, Seg, Slider } from "./ui";

type Tab = "caption" | "text" | "sticker" | "card" | "image" | "global";

interface StudioAssetsProps {
  tl: Timeline;
  selected: string | null;
  time: number;
  jobId: string;
  fontsReady: boolean;
  onSelect: (id: string, seekTo?: number) => void;
  onAdd: (type: ItemType, patch?: Partial<Item>) => void;
  onStyle: (p: Partial<TimelineStyle>) => void;
}

const RAIL: [Tab, string, string][] = [
  ["caption", "Phụ đề", ICO.caption],
  ["text", "Chữ", ICO.text],
  ["sticker", "Sticker", ICO.sticker],
  ["card", "Thẻ", ICO.card],
  ["image", "Ảnh", ICO.image],
  ["global", "Toàn cảnh", ICO.sliders],
];

const TEXT_PRESETS: { label: string; type: ItemType; patch: Partial<Item> }[] = [
  { label: "Tiêu đề", type: "title", patch: { text: "Tiêu đề", sub: "", font: "phudu" } },
  { label: "Tiêu đề + nhấn", type: "title", patch: { text: "Hành trình *xanh*", sub: "Dòng phụ nhỏ", font: "phudu" } },
  { label: "Chữ khối", type: "title", patch: { text: "ĐÀ GIANG", sub: "", font: "phudu", color: "#ff7a1a" } },
  { label: "Chữ hiện đại", type: "title", patch: { text: "Đi *trekking*", sub: "", font: "inter" } },
  { label: "Thẻ chữ sáng", type: "pill", patch: { text: "Có mệt không...?", theme: "light" } },
  { label: "Thẻ chữ xanh", type: "pill", patch: { text: "Rẻ hơn bạn nghĩ?", theme: "blue" } },
];
const CARD_PRESETS: { label: string; patch: Partial<Item> }[] = [
  { label: "Thẻ xanh đậm", patch: { title: "Môi trường cô lập", sub: "Mô tả ngắn", icon: "star", theme: "navy" } },
  { label: "Thẻ trắng", patch: { title: "Lưu ý quan trọng", sub: "Mang đủ nước", icon: "check", theme: "light" } },
  { label: "Thẻ không icon", patch: { title: "Bước 1", sub: "Đặt tour trước 3 ngày", icon: "", theme: "navy" } },
];

/** Ô xem trước mẫu — vẽ bằng đúng bộ vẽ của bản xuất */
function Tile({ item, label, style, fontsReady, onClick }: { item: Item; label: string; style: TimelineStyle; fontsReady: boolean; onClick: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [hover, setHover] = useState(false);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    let raf = 0;
    const t0 = performance.now();
    const draw = () => {
      const dpr = window.devicePixelRatio || 1;
      c.width = c.clientWidth * dpr;
      c.height = c.clientHeight * dpr;
      const ctx = c.getContext("2d")!;
      ctx.clearRect(0, 0, c.width, c.height);
      // hover: chạy lại hoạt ảnh vào; không thì đứng ở khung đã hiện đủ
      const t = hover ? ((performance.now() - t0) / 1000) % 2.4 : 1.8;
      drawFrame(ctx, { version: 1, duration: 9, landscape: true, style, items: [{ ...item, start: 0, end: 99, x: 0.5, y: 0.5 }] }, t, c.width, c.height);
      if (hover) raf = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, [item, style, fontsReady, hover]);
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className="group overflow-hidden rounded-lg border border-[#2a2a33] bg-[#0f0f13] text-left transition hover:border-[#1fd3d9]/70"
    >
      <canvas ref={ref} className="block aspect-[16/10] w-full" style={{ background: "radial-gradient(circle at 30% 20%, #2b3a46, #121318 70%)" }} />
      <span className="flex items-center justify-between px-2 py-1.5 text-[11px] text-[#c9c9d1]">
        {label}
        <span className="text-[#1fd3d9] opacity-0 transition group-hover:opacity-100">＋</span>
      </span>
    </button>
  );
}

/** Thanh công cụ dọc + thư viện (kiểu CapCut) */
export function StudioAssets({ tl, selected, time, jobId, fontsReady, onSelect, onAdd, onStyle }: StudioAssetsProps) {
  const [tab, setTab] = useState<Tab>("caption");
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const st = tl.style;
  const listOf = (types: ItemType[]) =>
    tl.items
      .filter((it) => types.includes(it.type))
      .filter((it) => !q || itemLabel(it).toLowerCase().includes(q.toLowerCase()))
      .sort((a, b) => a.start - b.start);

  const List = ({ types, empty }: { types: ItemType[]; empty: string }) => {
    const items = listOf(types);
    return (
      <div className="space-y-1">
        {items.map((it, i) => {
          const on = it.id === selected;
          const now = time >= it.start && time <= it.end;
          return (
            <button
              key={it.id}
              type="button"
              onClick={() => onSelect(it.id, it.start)}
              className={[
                "flex w-full items-start gap-2.5 rounded-md px-2.5 py-2 text-left transition",
                on ? "bg-[#1fd3d9]/10 ring-1 ring-[#1fd3d9]/60" : now ? "bg-white/[0.05]" : "hover:bg-white/[0.04]",
                it.hidden ? "opacity-40" : "",
              ].join(" ")}
            >
              <span className="mt-0.5 w-9 shrink-0 font-mono text-[10px] text-[#8d8d98]">{fmtTime(it.start)}</span>
              <span className="min-w-0 flex-1">
                <span className="line-clamp-2 text-[12px] leading-snug text-[#ececf1]">{(it.type === "caption" ? captionText(it) : itemLabel(it)) || "(trống)"}</span>
                {it.edited && <span className="text-[10px] text-[#1fd3d9]/80">đã sửa</span>}
              </span>
              <span className="mt-0.5 font-mono text-[10px] text-[#55555f]">{String(i + 1).padStart(2, "0")}</span>
            </button>
          );
        })}
        {!items.length && <p className="py-6 text-center text-[11px] text-[#55555f]">{empty}</p>}
      </div>
    );
  };

  const header = RAIL.find((r) => r[0] === tab)![1];

  return (
    <div className="flex min-h-0 border-r border-[#2a2a33] bg-[#16161b]">
      {/* Thanh công cụ dọc */}
      <nav className="flex w-[64px] shrink-0 flex-col items-center gap-1 border-r border-[#2a2a33] py-3">
        {RAIL.map(([k, label, d]) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            className={[
              "flex w-[54px] flex-col items-center gap-1 rounded-lg py-2 text-[10px] outline-none transition",
              tab === k ? "bg-white/[0.06] text-[#1fd3d9]" : "text-[#8d8d98] hover:text-[#ececf1]",
            ].join(" ")}
          >
            <Ico d={d} size={19} />
            {label}
          </button>
        ))}
      </nav>

      {/* Thư viện */}
      <div className="flex min-h-0 w-[272px] flex-col">
        <div className="flex items-center justify-between px-4 pb-2 pt-4">
          <p className="text-[13px] font-semibold text-[#ececf1]">{header}</p>
          {tab !== "global" && <span className="font-mono text-[10px] text-[#55555f]">tại {fmtTime(time)}</span>}
        </div>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-3 pb-4">
          {tab === "caption" && (
            <>
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm trong phụ đề…" className={inputCls} />
              <button
                type="button"
                onClick={() => onAdd("caption")}
                className="w-full rounded-md border border-dashed border-[#34343f] py-2 text-[12px] text-[#c9c9d1] transition hover:border-[#1fd3d9]/70 hover:text-white"
              >
                ＋ Thêm phụ đề tại đầu đọc
              </button>
              <List types={["caption"]} empty="Không có phụ đề" />
            </>
          )}

          {tab === "text" && (
            <>
              <div className="grid grid-cols-2 gap-2">
                {TEXT_PRESETS.map((p) => (
                  <Tile
                    key={p.label}
                    label={p.label}
                    style={st}
                    fontsReady={fontsReady}
                    item={{ id: "pv", type: p.type, start: 0, end: 9, ...p.patch, scale: p.type === "title" ? 1.6 : 2.6 } as Item}
                    onClick={() => onAdd(p.type, p.patch)}
                  />
                ))}
              </div>
              <p className="pt-1 text-[11px] font-semibold text-[#8d8d98]">Trong video</p>
              <List types={["title", "pill"]} empty="Chưa có chữ — bấm 1 mẫu ở trên" />
            </>
          )}

          {tab === "sticker" && (
            <>
              <div className="grid grid-cols-3 gap-2">
                {ICONS.map((ic) => (
                  <Tile
                    key={ic}
                    label={ICON_NAME[ic] ?? ic}
                    style={st}
                    fontsReady={fontsReady}
                    item={{ id: "pv", type: "icon", icon: ic, start: 0, end: 9, size: 640 } as Item}
                    onClick={() => onAdd("icon", { icon: ic })}
                  />
                ))}
              </div>
              <p className="pt-1 text-[11px] font-semibold text-[#8d8d98]">Trong video</p>
              <List types={["icon"]} empty="Chưa có sticker" />
            </>
          )}

          {tab === "card" && (
            <>
              <div className="grid grid-cols-1 gap-2">
                {CARD_PRESETS.map((p) => (
                  <Tile
                    key={p.label}
                    label={p.label}
                    style={st}
                    fontsReady={fontsReady}
                    item={{ id: "pv", type: "card", start: 0, end: 9, w: 0.55, scale: 1.7, ...p.patch } as Item}
                    onClick={() => onAdd("card", p.patch)}
                  />
                ))}
              </div>
              <p className="pt-1 text-[11px] font-semibold text-[#8d8d98]">Trong video</p>
              <List types={["card"]} empty="Chưa có thẻ" />
            </>
          )}

          {tab === "image" && (
            <>
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (!f) return;
                  setBusy(true);
                  try {
                    const r = await uploadAsset(jobId, f);
                    onAdd("image", { src: r.src });
                  } catch (err) {
                    window.alert(err instanceof Error ? err.message : "Lỗi tải ảnh");
                  } finally {
                    setBusy(false);
                  }
                }}
              />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="flex w-full flex-col items-center gap-2 rounded-lg border border-dashed border-[#34343f] py-6 text-[12px] text-[#c9c9d1] transition hover:border-[#1fd3d9]/70 hover:text-white"
              >
                <Ico d={ICO.image} size={22} />
                {busy ? "Đang tải ảnh…" : "Nhập ảnh minh hoạ"}
                <span className="text-[10px] text-[#55555f]">Ảnh chụp màn hình, ảnh chuyến đi… (PNG, JPG)</span>
              </button>
              <List types={["image"]} empty="Chưa có ảnh" />
            </>
          )}

          {tab === "global" && (
            <div className="space-y-4">
              <label className="flex items-center justify-between rounded-md bg-[#0f0f13] px-3 py-2 text-[12px] text-[#ececf1]">
                Hiện phụ đề
                <input type="checkbox" checked={st.captions} onChange={(e) => onStyle({ captions: e.target.checked })} className="h-4 w-4 accent-[#1fd3d9]" />
              </label>
              <div className="space-y-1.5">
                <p className="text-[11px] text-[#8d8d98]">Font phụ đề</p>
                <Seg<FontKey> value={st.captionFont} onChange={(captionFont) => onStyle({ captionFont })} options={[["phudu", "DT Phudu"], ["inter", "Inter"], ["serif", "Nghiêng"]]} />
              </div>
              <Slider label="Cỡ chữ" value={st.captionSize} min={0.6} max={1.6} step={0.02} onChange={(captionSize) => onStyle({ captionSize })} fmt={(v) => `${Math.round(v * 100)}%`} />
              <Slider label="Vị trí" value={st.captionY} min={0.3} max={0.95} step={0.005} onChange={(captionY) => onStyle({ captionY })} fmt={(v) => `${Math.round(v * 100)}%`} />
              <div className="space-y-1.5">
                <p className="text-[11px] text-[#8d8d98]">Màu nhấn (từ khoá, hộp chữ)</p>
                <ColorDot value={st.accent} fallback="#ff7a1a" onChange={(accent) => onStyle({ accent })} />
              </div>
              <div className="space-y-1.5">
                <p className="text-[11px] text-[#8d8d98]">Màu chữ nhấn (*…* trong tiêu đề)</p>
                <ColorDot value={st.emphasis === "#c4a5ff" ? undefined : st.emphasis} fallback={st.accent} onChange={(emphasis) => onStyle({ emphasis })} />
              </div>
              <p className="text-[10px] leading-relaxed text-[#55555f]">Áp dụng cho mọi phụ đề chưa kéo vị trí / đổi màu riêng.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
