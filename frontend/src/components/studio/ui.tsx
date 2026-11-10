"use client";

import { useState, type ReactNode } from "react";

/** Bảng màu kiểu CapCut (tối, xanh ngọc làm điểm nhấn) */
export const CC = {
  bg: "#0b0b0e",
  panel: "#16161b",
  panel2: "#1e1e25",
  line: "#2a2a33",
  text: "#ececf1",
  mute: "#8d8d98",
  accent: "#1fd3d9",
};

export function Section({ title, children, defaultOpen = true }: { title: string; children: ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-[#2a2a33]">
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-center justify-between px-4 py-3 text-left">
        <span className="text-[12px] font-semibold text-[#ececf1]">{title}</span>
        <span className={["text-[10px] text-[#8d8d98] transition", open ? "rotate-180" : ""].join(" ")}>▼</span>
      </button>
      {open && <div className="space-y-3 px-4 pb-4">{children}</div>}
    </div>
  );
}

export function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-16 shrink-0 text-[11px] text-[#8d8d98]">{label}</span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

export const inputCls =
  "w-full rounded-md border border-[#2a2a33] bg-[#0f0f13] px-2.5 py-1.5 text-[13px] text-[#ececf1] outline-none transition focus:border-[#1fd3d9]/70";

/** Thanh trượt + ô số, kiểu CapCut */
export function Slider({ label, value, min, max, step, onChange, fmt }: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; fmt?: (v: number) => string }) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <Row label={label}>
      <div className="flex items-center gap-2">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="cc-range h-1 flex-1 cursor-pointer appearance-none rounded-full"
          style={{ background: `linear-gradient(to right, #1fd3d9 ${pct}%, #34343f ${pct}%)` }}
        />
        <span className="w-12 shrink-0 rounded bg-[#0f0f13] px-1.5 py-0.5 text-right font-mono text-[11px] text-[#ececf1]">{fmt ? fmt(value) : value}</span>
      </div>
    </Row>
  );
}

export function Seg<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: [T, string][] }) {
  return (
    <div className="inline-flex w-full rounded-md bg-[#0f0f13] p-0.5">
      {options.map(([v, l]) => (
        <button
          key={v}
          type="button"
          onClick={() => onChange(v)}
          className={["flex-1 rounded px-2 py-1 text-[11px] transition", value === v ? "bg-[#2a2a33] text-[#ececf1]" : "text-[#8d8d98] hover:text-[#ececf1]"].join(" ")}
        >
          {l}
        </button>
      ))}
    </div>
  );
}

export function ColorDot({ value, fallback, onChange, onClear }: { value?: string; fallback: string; onChange: (v: string) => void; onClear?: () => void }) {
  const SW = ["#ffffff", "#111111", "#ff7a1a", "#ffd23f", "#1fd3d9", "#c4a5ff", "#ff5b8a", "#22c55e"];
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {SW.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          className={["h-5 w-5 rounded-full border transition", (value ?? fallback).toLowerCase() === c ? "border-[#1fd3d9] ring-2 ring-[#1fd3d9]/40" : "border-white/15 hover:scale-110"].join(" ")}
          style={{ background: c }}
          aria-label={c}
        />
      ))}
      <label className="relative h-5 w-5 cursor-pointer overflow-hidden rounded-full border border-white/15" title="Màu khác">
        <span className="absolute inset-0" style={{ background: "conic-gradient(red, yellow, lime, cyan, blue, magenta, red)" }} />
        <input type="color" value={value ?? fallback} onChange={(e) => onChange(e.target.value)} className="absolute inset-0 cursor-pointer opacity-0" />
      </label>
      {value && onClear && (
        <button type="button" onClick={onClear} className="text-[10px] text-[#8d8d98] hover:text-[#ececf1]">
          mặc định
        </button>
      )}
    </div>
  );
}

export function IconBtn({ title, onClick, children, disabled, danger }: { title: string; onClick: () => void; children: ReactNode; disabled?: boolean; danger?: boolean }) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={onClick}
      className={[
        "flex h-8 min-w-8 items-center justify-center gap-1 rounded-md px-2 text-[13px] transition disabled:opacity-30",
        danger ? "text-[#ff7b7b] hover:bg-red-500/10" : "text-[#c9c9d1] hover:bg-white/[0.07] hover:text-white",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

/** Icon nét mảnh (SVG) cho thanh công cụ */
export function Ico({ d, size = 18 }: { d: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {d.split("|").map((p, i) => (
        <path key={i} d={p} />
      ))}
    </svg>
  );
}

export const ICO = {
  undo: "M9 14 4 9l5-5|M4 9h10.5a5.5 5.5 0 0 1 0 11H11",
  redo: "m15 14 5-5-5-5|M20 9H9.5a5.5 5.5 0 0 0 0 11H13",
  split: "M12 3v18|m8 8-4 4 4 4|m16 8 4 4-4 4",
  trash: "M3 6h18|M8 6V4h8v2|M19 6l-1 14H6L5 6",
  copy: "M9 9h11v11H9z|M5 15H4V4h11v1",
  eye: "M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z|M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z",
  eyeOff: "M3 3l18 18|M10.6 5.1A10 10 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4.1|M6.6 6.6C3.8 8.4 2 12 2 12s3.5 7 10 7a9.6 9.6 0 0 0 5.4-1.6",
  play: "M7 4v16l13-8z",
  pause: "M7 4h3v16H7z|M14 4h3v16h-3z",
  zoomIn: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14z|m21 21-5-5|M11 8v6|M8 11h6",
  zoomOut: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14z|m21 21-5-5|M8 11h6",
  caption: "M4 5h16v14H4z|M7 15h4|M13 15h4|M7 11h10",
  text: "M5 6V4h14v2|M12 4v16|M9 20h6",
  sticker: "M12 3l2.6 5.6 6 .7-4.5 4.1 1.3 6L12 16.4 6.6 19.4l1.3-6L3.4 9.3l6-.7z",
  card: "M3 6h18v12H3z|M7 10h6|M7 14h10",
  image: "M4 5h16v14H4z|m4 16 5-5 4 4 3-3 4 4|M15 9.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z",
  sliders: "M4 21v-7|M4 10V3|M12 21v-9|M12 8V3|M20 21v-5|M20 12V3|M1 14h6|M9 8h6|M17 16h6",
  close: "M18 6 6 18|M6 6l12 12",
  magnet: "M6 3v8a6 6 0 0 0 12 0V3|M6 7h4|M14 7h4",
};
