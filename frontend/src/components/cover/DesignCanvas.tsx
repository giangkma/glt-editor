"use client";

import { useEffect, useRef, useState, type PointerEvent as RPointerEvent, type ReactNode } from "react";
import { GOOGLE_FONTS_CSS, drawCover, ensureFonts, hitTest, type CoverDesign, type CoverLayer, type LayerBox } from "@/lib/cover";

interface DesignCanvasProps {
  design: CoverDesign;
  selected: string | null;
  onSelect: (id: string | null) => void;
  onMove: (id: string, p: Partial<CoverLayer>) => void;
  /** nền phía sau lớp chữ (video / ảnh) — lấp đầy khung */
  children?: ReactNode;
  /** khung ngang 16:9 (video ngang) thay vì dọc 9:16 */
  landscape?: boolean;
}

/** Khung 9:16 xem trực tiếp: nền (video/ảnh) + lớp chữ/logo vẽ bằng canvas, kéo thả được */
export function DesignCanvas({ design, selected, onSelect, onMove, children, landscape }: DesignCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const boxes = useRef<LayerBox[]>([]);
  const drag = useRef<{ id: string; dx: number; dy: number } | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [tick, setTick] = useState(0);

  // Font Google (có tiếng Việt) — nạp 1 lần
  useEffect(() => {
    if (!document.querySelector("link[data-cover-fonts]")) {
      const l = document.createElement("link");
      l.rel = "stylesheet";
      l.href = GOOGLE_FONTS_CSS;
      l.dataset.coverFonts = "1";
      document.head.appendChild(l);
    }
  }, []);
  useEffect(() => {
    let alive = true;
    ensureFonts(design.layers).then(() => alive && setTick((t) => t + 1));
    return () => {
      alive = false;
    };
  }, [design.layers]);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ro = new ResizeObserver(() => {
      const dpr = window.devicePixelRatio || 1;
      setSize({ w: Math.round(c.clientWidth * dpr), h: Math.round(c.clientHeight * dpr) });
    });
    ro.observe(c);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c || !size.w) return;
    c.width = size.w;
    c.height = size.h;
    boxes.current = drawCover(c.getContext("2d")!, design, size.w, size.h, selected);
  }, [design, selected, size, tick]);

  const toCanvas = (e: RPointerEvent<HTMLCanvasElement>) => {
    const c = e.currentTarget;
    const r = c.getBoundingClientRect();
    return { px: ((e.clientX - r.left) / r.width) * c.width, py: ((e.clientY - r.top) / r.height) * c.height, W: c.width, H: c.height };
  };

  return (
    <div className={["relative w-full overflow-hidden rounded-xl bg-black", landscape ? "aspect-video" : "aspect-[9/16]"].join(" ")}>
      {children}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full cursor-move touch-none"
        onPointerDown={(e) => {
          const { px, py, W, H } = toCanvas(e);
          const hit = hitTest(boxes.current, px, py);
          onSelect(hit?.id ?? null);
          if (!hit) return;
          const l = design.layers.find((x) => x.id === hit.id)!;
          drag.current = { id: hit.id, dx: px / W - l.x, dy: py / H - l.y };
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (!drag.current) return;
          const { px, py, W, H } = toCanvas(e);
          let x = Math.min(1, Math.max(0, px / W - drag.current.dx));
          const y = Math.min(1, Math.max(0, py / H - drag.current.dy));
          if (Math.abs(x - 0.5) < 0.015) x = 0.5; // hít vào giữa
          onMove(drag.current.id, { x, y });
        }}
        onPointerUp={() => (drag.current = null)}
        onPointerCancel={() => (drag.current = null)}
      />
    </div>
  );
}
