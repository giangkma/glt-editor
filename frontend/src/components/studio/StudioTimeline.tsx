"use client";

import { useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent, type ReactNode } from "react";
import { fmtClock, itemLabel, type Item, type Timeline } from "@/lib/studio";
import { Ico, ICO, IconBtn } from "./ui";

interface StudioTimelineProps {
  tl: Timeline;
  duration: number;
  time: number;
  playing: boolean;
  selected: string | null;
  baseUrl: string | null;
  landscape: boolean;
  musicLabel?: string | null;
  onSeek: (t: number) => void;
  onSelect: (id: string | null) => void;
  onRetime: (id: string, start: number, end: number, record: boolean) => void;
  onSplit: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onToggleHide: () => void;
  onUndo: () => void;
  onRedo: () => void;
}

const CLIP: Record<string, { bg: string; glyph: string }> = {
  caption: { bg: "linear-gradient(180deg,#6d5bf0,#5544d6)", glyph: "T" },
  title: { bg: "linear-gradient(180deg,#e0913a,#c4741f)", glyph: "T" },
  pill: { bg: "linear-gradient(180deg,#3b8cf7,#2a6fe0)", glyph: "❝" },
  card: { bg: "linear-gradient(180deg,#15b3c7,#0b8fa1)", glyph: "▤" },
  icon: { bg: "linear-gradient(180deg,#b26ef7,#9446e6)", glyph: "★" },
  image: { bg: "linear-gradient(180deg,#d6b14a,#b8922c)", glyph: "▣" },
};
const HEAD = 92; // cột tên track

/** Ảnh thu nhỏ của video nền dọc theo dải thời gian */
function useThumbs(url: string | null, duration: number) {
  const [thumbs, setThumbs] = useState<{ t: number; src: string }[]>([]);
  useEffect(() => {
    if (!url || !duration) return;
    let alive = true;
    const v = document.createElement("video");
    v.crossOrigin = "anonymous";
    v.muted = true;
    v.preload = "auto";
    v.src = url;
    const n = Math.min(48, Math.max(8, Math.ceil(duration / 1.2)));
    const out: { t: number; src: string }[] = [];
    const c = document.createElement("canvas");
    const grab = async () => {
      for (let i = 0; i < n && alive; i++) {
        const t = Math.min(duration - 0.05, (i + 0.5) * (duration / n));
        await new Promise<void>((res) => {
          const done = () => {
            v.removeEventListener("seeked", done);
            res();
          };
          v.addEventListener("seeked", done);
          v.currentTime = t;
        });
        const h = 96;
        c.height = h;
        c.width = Math.round((h * v.videoWidth) / Math.max(1, v.videoHeight));
        try {
          c.getContext("2d")!.drawImage(v, 0, 0, c.width, c.height);
          out.push({ t, src: c.toDataURL("image/jpeg", 0.6) });
        } catch {
          return; // video khác nguồn chưa cho phép đọc ảnh → bỏ ảnh thu nhỏ
        }
        if (alive && (i % 6 === 5 || i === n - 1)) setThumbs([...out]);
      }
    };
    v.addEventListener("loadeddata", () => void grab(), { once: true });
    return () => {
      alive = false;
      v.removeAttribute("src");
      v.load();
    };
  }, [url, duration]);
  return thumbs;
}

/** TIMELINE kiểu CapCut: thước giờ, đầu đọc, các track chữ / hiệu ứng / video / nhạc, phóng to-thu nhỏ */
export function StudioTimeline(p: StudioTimelineProps) {
  const { tl, duration, time, selected } = p;
  const D = Math.max(0.5, duration);
  const scroller = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(800);
  const [zoom, setZoom] = useState(1);
  const drag = useRef<{ id: string; mode: "move" | "a" | "b"; x0: number; s0: number; e0: number; first: boolean } | null>(null);
  const scrub = useRef(false);
  const thumbs = useThumbs(p.baseUrl, duration);

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const pps = ((width - 40) / D) * zoom; // điểm ảnh / giây
  const total = D * pps + 40;
  const X = (t: number) => t * pps + 12;

  // Đầu đọc luôn trong khung khi đang chạy
  useEffect(() => {
    const el = scroller.current;
    if (!el || !p.playing) return;
    const x = X(time);
    if (x > el.scrollLeft + el.clientWidth - 60 || x < el.scrollLeft) el.scrollLeft = x - 80;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [time, p.playing]);

  // Xếp hiệu ứng thành các hàng không chồng nhau
  const rows = useMemo(() => {
    const fx = tl.items.filter((i) => i.type !== "caption").sort((a, b) => a.start - b.start);
    const r: Item[][] = [];
    for (const it of fx) {
      const row = r.find((x) => x[x.length - 1].end <= it.start + 0.01);
      if (row) row.push(it);
      else r.push([it]);
    }
    return r;
  }, [tl.items]);
  const caps = tl.items.filter((i) => i.type === "caption");

  // Vạch thước
  const step = [0.5, 1, 2, 5, 10, 15, 30, 60].find((s) => s * pps >= (s < 1 ? 90 : 70)) ?? 60;
  const ticks: number[] = [];
  for (let t = 0; t <= D + 0.001; t += step) ticks.push(Math.round(t * 100) / 100);

  const tFromEvent = (clientX: number) => {
    const el = scroller.current!;
    const r = el.getBoundingClientRect();
    return Math.max(0, Math.min(D, (clientX - r.left + el.scrollLeft - 12) / pps));
  };

  const onMove = (e: RPointerEvent) => {
    if (scrub.current) {
      p.onSeek(tFromEvent(e.clientX));
      return;
    }
    const d = drag.current;
    if (!d) return;
    let dt = (e.clientX - d.x0) / pps;
    // nam châm: hít vào đầu đọc khi gần (< 8px)
    const snap = (t: number) => (Math.abs((t - time) * pps) < 8 ? time : t);
    let s = d.s0, en = d.e0;
    if (d.mode === "move") {
      s = snap(Math.max(0, Math.min(D - (d.e0 - d.s0), d.s0 + dt)));
      en = s + (d.e0 - d.s0);
    } else if (d.mode === "a") s = snap(Math.max(0, Math.min(d.e0 - 0.2, d.s0 + dt)));
    else en = snap(Math.min(D + 3, Math.max(d.s0 + 0.2, d.e0 + dt)));
    void dt;
    p.onRetime(d.id, Math.round(s * 100) / 100, Math.round(en * 100) / 100, d.first);
    d.first = false;
  };
  const end = () => {
    drag.current = null;
    scrub.current = false;
  };

  const Clip = ({ it }: { it: Item }) => {
    const on = it.id === selected;
    const c = CLIP[it.type] ?? CLIP.title;
    return (
      <div
        className={["absolute top-[3px] flex h-[26px] cursor-grab items-center gap-1.5 overflow-hidden rounded-[5px] px-2 text-[11px] font-medium text-white shadow-sm active:cursor-grabbing", on ? "z-10 ring-2 ring-white" : "ring-1 ring-black/30", it.hidden ? "opacity-35" : ""].join(" ")}
        style={{ left: X(it.start), width: Math.max(8, (it.end - it.start) * pps), background: c.bg }}
        title={itemLabel(it)}
        onPointerDown={(e) => {
          e.stopPropagation();
          p.onSelect(it.id);
          const r = e.currentTarget.getBoundingClientRect();
          const mode = e.clientX - r.left < 7 ? "a" : r.right - e.clientX < 7 ? "b" : "move";
          drag.current = { id: it.id, mode, x0: e.clientX, s0: it.start, e0: it.end, first: true };
          scroller.current?.setPointerCapture(e.pointerId);
        }}
      >
        {on && <span className="absolute inset-y-0 left-0 w-[6px] cursor-ew-resize bg-white/90" />}
        <span className="pointer-events-none shrink-0 opacity-80">{c.glyph}</span>
        <span className="pointer-events-none truncate">{itemLabel(it) || "(trống)"}</span>
        {on && <span className="absolute inset-y-0 right-0 w-[6px] cursor-ew-resize bg-white/90" />}
      </div>
    );
  };

  const trackRows: { key: string; label: string; h: number; node: ReactNode }[] = [
    ...rows.map((row, i) => ({
      key: `fx${i}`,
      label: i === 0 ? "Hiệu ứng" : "",
      h: 32,
      node: row.map((it) => <Clip key={it.id} it={it} />),
    })),
    { key: "cap", label: "Phụ đề", h: 32, node: caps.map((it) => <Clip key={it.id} it={it} />) },
    {
      key: "video",
      label: "Video",
      h: 54,
      node: (
        <div className="absolute top-[3px] h-[48px] overflow-hidden rounded-[5px] ring-1 ring-white/10" style={{ left: X(0), width: D * pps, background: "#22232b" }}>
          <div className="flex h-full">
            {thumbs.length
              ? Array.from({ length: Math.max(1, Math.ceil((D * pps) / (p.landscape ? 85 : 27))) }).map((_, i, arr) => {
                  const t = ((i + 0.5) / arr.length) * D;
                  const th = thumbs.reduce((a, b) => (Math.abs(b.t - t) < Math.abs(a.t - t) ? b : a), thumbs[0]);
                  // eslint-disable-next-line @next/next/no-img-element
                  return <img key={i} src={th.src} alt="" className="h-full shrink-0 object-cover" style={{ width: p.landscape ? 85 : 27 }} draggable={false} />;
                })
              : null}
          </div>
        </div>
      ),
    },
    {
      key: "audio",
      label: "Âm thanh",
      h: 26,
      node: (
        <div
          className="absolute top-[3px] flex h-[20px] items-center overflow-hidden rounded-[5px] px-2 text-[10px] text-emerald-50/90"
          style={{ left: X(0), width: D * pps, background: "repeating-linear-gradient(90deg,#1c7a55 0 2px,#155e42 2px 5px)" }}
        >
          ♪ {p.musicLabel ?? "Âm thanh gốc + nhạc nền"}
        </div>
      ),
    },
  ];

  return (
    <div className="flex h-full min-h-0 flex-col border-t border-[#2a2a33] bg-[#121217]">
      {/* Thanh công cụ */}
      <div className="flex h-10 shrink-0 items-center gap-1 border-b border-[#2a2a33] px-2">
        <IconBtn title="Hoàn tác (⌘Z)" onClick={p.onUndo}>
          <Ico d={ICO.undo} size={16} />
        </IconBtn>
        <IconBtn title="Làm lại (⇧⌘Z)" onClick={p.onRedo}>
          <Ico d={ICO.redo} size={16} />
        </IconBtn>
        <span className="mx-1 h-5 w-px bg-[#2a2a33]" />
        <IconBtn title="Tách tại đầu đọc (S)" onClick={p.onSplit} disabled={!selected}>
          <Ico d={ICO.split} size={16} />
        </IconBtn>
        <IconBtn title="Nhân đôi" onClick={p.onDuplicate} disabled={!selected}>
          <Ico d={ICO.copy} size={16} />
        </IconBtn>
        <IconBtn title="Ẩn / hiện" onClick={p.onToggleHide} disabled={!selected}>
          <Ico d={ICO.eyeOff} size={16} />
        </IconBtn>
        <IconBtn title="Xoá (Delete)" onClick={p.onDelete} disabled={!selected} danger>
          <Ico d={ICO.trash} size={16} />
        </IconBtn>
        <span className="ml-3 font-mono text-[11px] text-[#8d8d98]">
          <span className="text-[#1fd3d9]">{fmtClock(time)}</span> / {fmtClock(D)}
        </span>
        <div className="ml-auto flex items-center gap-1.5">
          <IconBtn title="Thu nhỏ" onClick={() => setZoom((z) => Math.max(1, z / 1.4))}>
            <Ico d={ICO.zoomOut} size={16} />
          </IconBtn>
          <input
            type="range"
            min={1}
            max={12}
            step={0.1}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="cc-range h-1 w-28 cursor-pointer appearance-none rounded-full"
            style={{ background: `linear-gradient(to right,#c9c9d1 ${((zoom - 1) / 11) * 100}%,#34343f ${((zoom - 1) / 11) * 100}%)` }}
            aria-label="Phóng to dải thời gian"
          />
          <IconBtn title="Phóng to" onClick={() => setZoom((z) => Math.min(12, z * 1.4))}>
            <Ico d={ICO.zoomIn} size={16} />
          </IconBtn>
          <IconBtn title="Vừa khung" onClick={() => setZoom(1)}>
            <span className="text-[11px]">Vừa</span>
          </IconBtn>
        </div>
      </div>

      {/* Tên track + dải thời gian */}
      <div className="flex min-h-0 flex-1">
        <div className="shrink-0 border-r border-[#2a2a33] bg-[#16161b]" style={{ width: HEAD }}>
          <div className="h-7 border-b border-[#2a2a33]" />
          {trackRows.map((r) => (
            <div key={r.key} className="flex items-center px-3 text-[10px] text-[#8d8d98]" style={{ height: r.h }}>
              {r.label}
            </div>
          ))}
        </div>
        <div
          ref={scroller}
          className="relative min-w-0 flex-1 select-none overflow-x-auto overflow-y-auto"
          onPointerMove={onMove}
          onPointerUp={end}
          onPointerCancel={end}
          onWheel={(e) => {
            if (e.ctrlKey || e.metaKey) {
              e.preventDefault();
              setZoom((z) => Math.min(12, Math.max(1, z * (e.deltaY < 0 ? 1.12 : 0.9))));
            }
          }}
        >
          <div className="relative" style={{ width: total }}>
            {/* thước giờ */}
            <div
              className="sticky top-0 z-20 h-7 cursor-pointer border-b border-[#2a2a33] bg-[#121217]"
              onPointerDown={(e) => {
                scrub.current = true;
                p.onSeek(tFromEvent(e.clientX));
                scroller.current?.setPointerCapture(e.pointerId);
              }}
            >
              {ticks.map((t) => (
                <div key={t} className="absolute top-0 h-full" style={{ left: X(t) }}>
                  <div className="h-2.5 w-px bg-[#55555f]" />
                  <span className="absolute left-1 top-2.5 font-mono text-[9px] text-[#8d8d98]">{step < 1 ? fmtClock(t) : fmtClock(t).slice(0, 5)}</span>
                  {[1, 2, 3, 4].map((k) => (
                    <div key={k} className="absolute top-0 h-1.5 w-px bg-[#34343f]" style={{ left: (step * pps * k) / 5 }} />
                  ))}
                </div>
              ))}
            </div>
            {/* các track */}
            <div
              onPointerDown={(e) => {
                if (e.target === e.currentTarget) {
                  p.onSelect(null);
                  p.onSeek(tFromEvent(e.clientX));
                }
              }}
            >
              {trackRows.map((r) => (
                <div key={r.key} className="relative border-b border-white/[0.03]" style={{ height: r.h }} onPointerDown={(e) => e.target === e.currentTarget && (p.onSelect(null), p.onSeek(tFromEvent(e.clientX)))}>
                  {r.node}
                </div>
              ))}
            </div>
            {/* đầu đọc */}
            <div className="pointer-events-none absolute bottom-0 top-0 z-30" style={{ left: X(time) }}>
              <div className="absolute -left-[6px] top-0 h-3.5 w-[13px] rounded-b-[4px] bg-white shadow" />
              <div className="absolute left-0 top-0 h-full w-px bg-white" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
