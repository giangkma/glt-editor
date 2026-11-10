"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { API_URL } from "@/lib/config";
import { drawFrame, hitTest, type Box } from "@/lib/overlay/render";
import { assetUrl, fetchStudio, fmtClock, loadStudioFonts, newItem, saveTimeline, splitItem, type Item, type ItemType, type StudioData, type Timeline } from "@/lib/studio";
import type { EditJob } from "@/types/edit";
import { StudioAssets } from "./StudioAssets";
import { StudioInspector } from "./StudioInspector";
import { StudioTimeline } from "./StudioTimeline";
import { Ico, ICO, IconBtn } from "./ui";

interface StudioProps {
  job: EditJob;
  onClose: () => void;
  /** Xuất lại video với chữ / hiệu ứng đã sửa */
  onExport: () => void;
}

type SaveState = "saved" | "dirty" | "saving" | "error";

const RANGE_CSS = `
.cc-range::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;width:12px;height:12px;border-radius:50%;background:#fff;box-shadow:0 0 0 2px #1fd3d9;cursor:pointer}
.cc-range::-moz-range-thumb{width:12px;height:12px;border:none;border-radius:50%;background:#fff;box-shadow:0 0 0 2px #1fd3d9;cursor:pointer}
.cc-scroll::-webkit-scrollbar{width:8px;height:8px}.cc-scroll::-webkit-scrollbar-thumb{background:#2f2f38;border-radius:8px}`;

/**
 * STUDIO kiểu CapCut: thư viện bên trái (phụ đề, chữ, sticker, thẻ, ảnh, toàn cảnh) · trình phát giữa ·
 * thuộc tính bên phải · timeline nhiều track phía dưới. Xem trực tiếp bằng đúng bộ vẽ của bản xuất.
 */
export function Studio(props: StudioProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
    // phủ toàn màn hình: khoá cuộn trang phía sau
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);
  // Portal ra <body>: tránh bị kẹt trong khung có hiệu ứng transform của trang
  return mounted ? createPortal(<StudioInner {...props} />, document.body) : null;
}

function StudioInner({ job, onClose, onExport }: StudioProps) {
  const [data, setData] = useState<StudioData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tl, setTl] = useState<Timeline | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [save, setSave] = useState<SaveState>("saved");
  const [fontsReady, setFontsReady] = useState(false);

  const history = useRef<Timeline[]>([]);
  const future = useRef<Timeline[]>([]);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const boxesRef = useRef<Box[]>([]);
  const images = useRef(new Map<string, HTMLImageElement>());
  const live = useRef({ tl, selected });
  live.current = { tl, selected };
  const drag = useRef<{ id: string; dx: number; dy: number; moved: boolean } | null>(null);

  useEffect(() => {
    let alive = true;
    Promise.all([fetchStudio(job.id), loadStudioFonts()])
      .then(([d]) => {
        if (!alive) return;
        setData(d);
        setTl(d.timeline);
        setFontsReady(true);
      })
      .catch((e) => alive && setError(e instanceof Error ? e.message : "Không mở được Studio."));
    return () => {
      alive = false;
    };
  }, [job.id]);

  useEffect(() => {
    for (const it of tl?.items ?? []) {
      if (it.type === "image" && it.src && !images.current.has(it.src)) {
        const im = new Image();
        im.crossOrigin = "anonymous";
        im.src = assetUrl(job.id, it.src);
        images.current.set(it.src, im);
      }
    }
  }, [tl, job.id]);

  // ── Sửa (có hoàn tác) ──
  const commit = useCallback((fn: (t: Timeline) => Timeline, record = true) => {
    setTl((cur) => {
      if (!cur) return cur;
      if (record) {
        history.current.push(cur);
        if (history.current.length > 100) history.current.shift();
        future.current = [];
      }
      return fn(cur);
    });
    setSave("dirty");
  }, []);
  const patchItem = useCallback(
    (id: string, patch: Partial<Item>, record = true) =>
      commit((t) => ({ ...t, items: t.items.map((it) => (it.id === id ? { ...it, ...patch, edited: true } : it)) }), record),
    [commit],
  );
  const removeItem = useCallback(
    (id: string) => {
      commit((t) => ({
        ...t,
        items: t.items.filter((it) => it.id !== id),
        removed: id.startsWith("u-") ? t.removed : [...new Set([...(t.removed ?? []), id])],
      }));
      setSelected(null);
    },
    [commit],
  );
  const addItem = useCallback(
    (type: ItemType, patch: Partial<Item> = {}) => {
      if (!tl) return;
      const fresh = newItem(type, videoRef.current?.currentTime ?? time, tl.landscape);
      const it: Item = { ...fresh, ...patch, id: fresh.id, edited: true };
      commit((t) => ({ ...t, items: [...t.items, it] }));
      setSelected(it.id);
    },
    [commit, tl, time],
  );
  const split = useCallback(() => {
    const cur = live.current.tl?.items.find((i) => i.id === live.current.selected);
    const t = videoRef.current?.currentTime ?? 0;
    if (!cur) return;
    const parts = splitItem(cur, t);
    if (!parts) return;
    commit((tt) => ({ ...tt, items: tt.items.flatMap((i) => (i.id === cur.id ? parts : [i])) }));
    setSelected(parts[1].id);
  }, [commit]);
  const undo = useCallback(() => {
    const prev = history.current.pop();
    if (!prev) return;
    setTl((cur) => {
      if (cur) future.current.push(cur);
      return prev;
    });
    setSave("dirty");
  }, []);
  const redo = useCallback(() => {
    const next = future.current.pop();
    if (!next) return;
    setTl((cur) => {
      if (cur) history.current.push(cur);
      return next;
    });
    setSave("dirty");
  }, []);

  // ── Tự lưu ──
  useEffect(() => {
    if (save !== "dirty" || !tl) return;
    const h = setTimeout(async () => {
      setSave("saving");
      try {
        await saveTimeline(job.id, tl);
        setSave((s) => (s === "saving" ? "saved" : s));
      } catch {
        setSave("error");
      }
    }, 700);
    return () => clearTimeout(h);
  }, [tl, save, job.id]);

  // ── Vẽ liên tục ──
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      const c = canvasRef.current;
      const v = videoRef.current;
      const { tl: t, selected: sel } = live.current;
      if (c && t) {
        const dpr = window.devicePixelRatio || 1;
        const w = Math.round(c.clientWidth * dpr);
        const h = Math.round(c.clientHeight * dpr);
        if (w && h) {
          if (c.width !== w || c.height !== h) {
            c.width = w;
            c.height = h;
          }
          const ctx = c.getContext("2d")!;
          ctx.clearRect(0, 0, w, h);
          const now = v?.currentTime ?? 0;
          boxesRef.current = drawFrame(ctx, t, now, w, h, { images: images.current, selected: sel });
          if (v && !v.paused) setTime(now);
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const seek = useCallback((t: number) => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = Math.max(0, Math.min(t, (v.duration || t) - 0.01));
    setTime(v.currentTime);
  }, []);
  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) void v.play();
    else v.pause();
  }, []);
  const step = useCallback((d: number) => {
    const v = videoRef.current;
    if (!v) return;
    v.pause();
    seek(v.currentTime + d);
  }, [seek]);

  // ── Phím tắt ──
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      const k = e.key.toLowerCase();
      if (e.key === " ") {
        e.preventDefault();
        togglePlay();
      } else if ((e.metaKey || e.ctrlKey) && k === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if ((e.key === "Delete" || e.key === "Backspace") && live.current.selected) {
        e.preventDefault();
        removeItem(live.current.selected);
      } else if (k === "s" && !e.metaKey && !e.ctrlKey) split();
      else if (e.key === "ArrowLeft") step(e.shiftKey ? -1 : -1 / 30);
      else if (e.key === "ArrowRight") step(e.shiftKey ? 1 : 1 / 30);
      else if (e.key === "Escape") setSelected(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [togglePlay, undo, redo, removeItem, split, step]);

  const sel = useMemo(() => tl?.items.find((it) => it.id === selected) ?? null, [tl, selected]);
  const landscape = Boolean(data?.base ? data.base.width > data.base.height : tl?.landscape);
  const duration = data?.base?.duration ?? tl?.duration ?? 0;
  const baseUrl = data?.base ? `${API_URL}${data.base.url}` : null;

  const exportNow = async () => {
    if (tl && save !== "saved") {
      setSave("saving");
      try {
        await saveTimeline(job.id, tl);
        setSave("saved");
      } catch {
        setSave("error");
        return;
      }
    }
    onExport();
  };

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-[#0b0b0e] text-[#ececf1]" style={{ fontFamily: "Inter, system-ui, sans-serif" }}>
      <style>{RANGE_CSS}</style>

      {/* ── Thanh trên ── */}
      <header className="flex h-12 shrink-0 items-center gap-3 border-b border-[#2a2a33] bg-[#16161b] px-3">
        <IconBtn title="Đóng Studio" onClick={onClose}>
          <Ico d={ICO.close} size={16} />
        </IconBtn>
        <span className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-[#1fd3d9] shadow-[0_0_10px_#1fd3d9]" />
          <span className="text-[13px] font-semibold tracking-tight">Studio</span>
        </span>
        <span className="h-4 w-px bg-[#2a2a33]" />
        <p className="min-w-0 max-w-[40vw] truncate text-[12px] text-[#8d8d98]">{job.videoName}</p>
        <span
          className={[
            "ml-2 flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px]",
            save === "error" ? "bg-red-500/10 text-red-300" : "bg-white/[0.04] text-[#8d8d98]",
          ].join(" ")}
        >
          <span className={["h-1.5 w-1.5 rounded-full", save === "saved" ? "bg-emerald-400" : save === "error" ? "bg-red-400" : "bg-amber-300"].join(" ")} />
          {save === "saved" ? "Đã lưu" : save === "saving" ? "Đang lưu…" : save === "dirty" ? "Chưa lưu" : "Lỗi lưu"}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <span className="hidden text-[10px] text-[#55555f] xl:block">Space chạy · ←/→ từng khung · S tách · ⌘Z hoàn tác · Delete xoá</span>
          <button
            type="button"
            onClick={exportNow}
            disabled={!tl || !data?.canCompose}
            className="flex items-center gap-1.5 rounded-md bg-[#1fd3d9] px-4 py-1.5 text-[13px] font-semibold text-[#06272a] transition hover:brightness-110 disabled:opacity-40"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M12 3v12" />
              <path d="m7 10 5 5 5-5" />
              <path d="M5 21h14" />
            </svg>
            Xuất
          </button>
        </div>
      </header>

      {error && <p className="p-8 text-center text-sm text-red-400">{error}</p>}
      {!error && (!tl || !data) && <div className="m-auto h-9 w-9 animate-spin rounded-full border-2 border-[#2a2a33] border-t-[#1fd3d9]" />}
      {data && !data.canCompose && (
        <p className="bg-amber-500/10 px-4 py-1.5 text-center text-[11px] text-amber-200">
          Backend thiếu thư viện vẽ chữ (@napi-rs/canvas) — chạy lại ./start.sh để tự cài, rồi mở lại Studio.
        </p>
      )}

      {tl && data && (
        <>
          {/* ── Thư viện · Trình phát · Thuộc tính ── */}
          <div className="grid min-h-0 flex-1 grid-cols-[auto_1fr_320px]">
            <StudioAssets
              tl={tl}
              selected={selected}
              time={time}
              jobId={job.id}
              fontsReady={fontsReady}
              onSelect={(id, t) => {
                setSelected(id);
                if (t !== undefined) seek(t);
              }}
              onAdd={addItem}
              onStyle={(p) => commit((t) => ({ ...t, style: { ...t.style, ...p } }))}
            />

            <section className="flex min-h-0 min-w-0 flex-col bg-[#0b0b0e]">
              <div className="flex h-9 shrink-0 items-center justify-between border-b border-[#2a2a33] px-4 text-[11px] text-[#8d8d98]">
                <span>Trình phát</span>
                <span className="font-mono">{data.base ? `${data.base.width}×${data.base.height}` : ""}</span>
              </div>
              <div className="relative flex min-h-0 flex-1 items-center justify-center p-4">
                <div
                  className="relative max-h-full max-w-full overflow-hidden rounded-md bg-black shadow-[0_20px_60px_-20px_rgba(0,0,0,0.9)]"
                  style={{
                    aspectRatio: `${data.base?.width ?? (landscape ? 16 : 9)} / ${data.base?.height ?? (landscape ? 9 : 16)}`,
                    height: landscape ? "auto" : "100%",
                    width: landscape ? "100%" : "auto",
                  }}
                >
                  {baseUrl ? (
                    <video
                      ref={videoRef}
                      src={baseUrl}
                      playsInline
                      preload="auto"
                      className="absolute inset-0 h-full w-full object-contain"
                      onPlay={() => setPlaying(true)}
                      onPause={() => {
                        setPlaying(false);
                        setTime(videoRef.current?.currentTime ?? 0);
                      }}
                      onSeeked={() => setTime(videoRef.current?.currentTime ?? 0)}
                    />
                  ) : (
                    <p className="absolute inset-0 flex items-center justify-center text-xs text-[#55555f]">Không còn video nền</p>
                  )}
                  <canvas
                    ref={canvasRef}
                    className={["absolute inset-0 h-full w-full touch-none", fontsReady ? "" : "opacity-0"].join(" ")}
                    onPointerDown={(e) => {
                      const c = e.currentTarget;
                      const r = c.getBoundingClientRect();
                      const px = ((e.clientX - r.left) / r.width) * c.width;
                      const py = ((e.clientY - r.top) / r.height) * c.height;
                      const hit = hitTest(boxesRef.current, px, py);
                      if (!hit) {
                        setSelected(null);
                        return;
                      }
                      setSelected(hit.id);
                      videoRef.current?.pause();
                      drag.current = { id: hit.id, dx: px / c.width - hit.cx / c.width, dy: py / c.height - hit.cy / c.height, moved: false };
                      c.setPointerCapture(e.pointerId);
                    }}
                    onPointerMove={(e) => {
                      const d = drag.current;
                      if (!d) return;
                      const c = e.currentTarget;
                      const r = c.getBoundingClientRect();
                      let x = (e.clientX - r.left) / r.width - d.dx;
                      const y = (e.clientY - r.top) / r.height - d.dy;
                      if (Math.abs(x - 0.5) < 0.012) x = 0.5;
                      const it = live.current.tl?.items.find((i) => i.id === d.id);
                      if (!it) return;
                      const box = boxesRef.current.find((b) => b.id === d.id);
                      const yy = it.type === "caption" && box ? y + box.h / 2 / c.height : y;
                      patchItem(d.id, { x: clamp01(x), y: clamp01(yy) }, !d.moved);
                      d.moved = true;
                    }}
                    onPointerUp={() => (drag.current = null)}
                    onPointerCancel={() => (drag.current = null)}
                  />
                </div>
              </div>
              {/* điều khiển phát */}
              <div className="flex h-11 shrink-0 items-center gap-2 border-t border-[#2a2a33] px-4">
                <span className="w-36 font-mono text-[11px] text-[#8d8d98]">
                  <span className="text-[#1fd3d9]">{fmtClock(time)}</span> / {fmtClock(duration)}
                </span>
                <div className="mx-auto flex items-center gap-1">
                  <IconBtn title="Lùi 1 giây (⇧←)" onClick={() => step(-1)}>
                    <span className="text-[11px]">-1s</span>
                  </IconBtn>
                  <IconBtn title="Khung trước (←)" onClick={() => step(-1 / 30)}>
                    <span className="text-[13px]">⏮</span>
                  </IconBtn>
                  <button
                    type="button"
                    onClick={togglePlay}
                    aria-label={playing ? "Dừng" : "Chạy"}
                    className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-black transition hover:scale-105"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                      {playing ? <path d="M6 4h4v16H6zM14 4h4v16h-4z" /> : <path d="M7 4v16l13-8z" />}
                    </svg>
                  </button>
                  <IconBtn title="Khung sau (→)" onClick={() => step(1 / 30)}>
                    <span className="text-[13px]">⏭</span>
                  </IconBtn>
                  <IconBtn title="Tới 1 giây (⇧→)" onClick={() => step(1)}>
                    <span className="text-[11px]">+1s</span>
                  </IconBtn>
                </div>
                <span className="flex w-36 justify-end">
                  {sel && (
                    <button
                      type="button"
                      onClick={() => {
                        seek(Math.max(0, sel.start - 0.3));
                        void videoRef.current?.play();
                      }}
                      className="rounded-md bg-white/[0.06] px-2.5 py-1 text-[11px] text-[#c9c9d1] hover:bg-white/[0.1]"
                    >
                      ▶ Xem từ mục này
                    </button>
                  )}
                </span>
              </div>
            </section>

            <StudioInspector
              item={sel}
              time={time}
              jobId={job.id}
              landscape={landscape}
              onPatch={(p, record) => sel && patchItem(sel.id, p, record)}
              onRemove={() => sel && removeItem(sel.id)}
              onDuplicate={() => sel && addItem(sel.type, { ...sel, start: sel.start + 0.5, end: sel.end + 0.5 })}
            />
          </div>

          {/* ── Timeline ── */}
          <div className="h-[34vh] min-h-[220px] shrink-0">
            <StudioTimeline
              tl={tl}
              duration={duration}
              time={time}
              playing={playing}
              selected={selected}
              baseUrl={baseUrl}
              landscape={landscape}
              musicLabel={job.stats?.music ? `Nhạc nền · ${job.stats.music}` : null}
              onSeek={seek}
              onSelect={setSelected}
              onRetime={(id, start, end, record) => patchItem(id, { start, end, ...wordShift(id, start, end) }, record)}
              onSplit={split}
              onDelete={() => sel && removeItem(sel.id)}
              onDuplicate={() => sel && addItem(sel.type, { ...sel, start: sel.start + 0.5, end: sel.end + 0.5 })}
              onToggleHide={() => sel && patchItem(sel.id, { hidden: !sel.hidden })}
              onUndo={undo}
              onRedo={redo}
            />
          </div>
        </>
      )}
    </div>
  );

  /** Kéo cả thanh phụ đề → dời mốc từng từ theo (kéo mép thì giữ nguyên mốc từ) */
  function wordShift(id: string, start: number, end: number): Partial<Item> {
    const it = live.current.tl?.items.find((i) => i.id === id);
    if (!it || it.type !== "caption" || !it.lines) return {};
    if (Math.abs(end - start - (it.end - it.start)) > 0.001) return {};
    const d = start - it.start;
    return { lines: it.lines.map((l) => ({ ...l, words: l.words.map((w) => ({ ...w, t: Math.round((w.t + d) * 1000) / 1000 })) })) };
  }
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
