"use client";

import { useRef, type ReactNode } from "react";
import {
  COVER_FONTS,
  SWATCHES,
  fontById,
  layerOf,
  logoLayer,
  newId,
  readLogo,
  type CoverDesign,
  type CoverLayer,
} from "@/lib/cover";

interface DesignControlsProps {
  design: CoverDesign;
  onChange: (d: CoverDesign) => void;
  selected: string | null;
  onSelect: (id: string | null) => void;
  templates?: { id: string; label: string; make: () => CoverDesign }[];
  darkenLabel?: string;
}

/** Bảng chỉnh: mẫu, các dòng chữ / logo, font, cỡ, màu, viền, nhãn, xoay, làm tối nền */
export function DesignControls({ design, onChange, selected, onSelect, templates = [], darkenLabel = "Làm tối nền cho chữ nổi" }: DesignControlsProps) {
  const logoInput = useRef<HTMLInputElement>(null);
  const sel = design.layers.find((l) => l.id === selected) ?? null;
  const setLayers = (layers: CoverLayer[]) => onChange({ ...design, layers });
  const patchSel = (p: Partial<CoverLayer>) => sel && setLayers(design.layers.map((l) => (l.id === sel.id ? { ...l, ...p } : l)));

  const add = (l: CoverLayer) => {
    setLayers([...design.layers, l]);
    onSelect(l.id);
  };
  const addText = (kind: "vuong" | "cach-dieu" | "nhan") => add(layerOf(kind, { y: Math.min(0.85, 0.3 + design.layers.length * 0.07) }));
  const removeSel = () => {
    if (!sel) return;
    const rest = design.layers.filter((l) => l.id !== sel.id);
    setLayers(rest);
    onSelect(rest.at(-1)?.id ?? null);
  };
  const duplicateSel = () => sel && add({ ...sel, id: newId(), y: Math.min(0.95, sel.y + 0.06) });
  const moveSel = (dir: -1 | 1) => {
    if (!sel) return;
    const i = design.layers.indexOf(sel);
    const j = i + dir;
    if (j < 0 || j >= design.layers.length) return;
    const next = [...design.layers];
    [next[i], next[j]] = [next[j], next[i]];
    setLayers(next);
  };

  return (
    <div className="min-w-0 space-y-4">
      {templates.length > 0 && (
        <div className="space-y-2">
          <Label>Mẫu</Label>
          <div className="flex flex-wrap gap-1.5">
            {templates.map((t) => (
              <SmallBtn
                key={t.id}
                onClick={() => {
                  const d = t.make();
                  // giữ logo đang có
                  const logos = design.layers.filter((l) => l.image);
                  onChange({ ...d, layers: [...logos, ...d.layers] });
                  onSelect(d.layers.at(-1)?.id ?? null);
                }}
              >
                {t.label}
              </SmallBtn>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Label>Các lớp</Label>
          <div className="flex flex-wrap gap-1.5">
            <SmallBtn onClick={() => addText("vuong")}>+ Chữ vuông</SmallBtn>
            <SmallBtn onClick={() => addText("cach-dieu")}>+ Chữ cách điệu</SmallBtn>
            <SmallBtn onClick={() => addText("nhan")}>+ Nhãn nền</SmallBtn>
            <SmallBtn onClick={() => logoInput.current?.click()}>+ Logo</SmallBtn>
            <input
              ref={logoInput}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/svg+xml"
              className="hidden"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) add(logoLayer(await readLogo(f)));
              }}
            />
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {design.layers.map((l) => (
            <button
              key={l.id}
              type="button"
              onClick={() => onSelect(l.id)}
              className={[
                "max-w-[12rem] truncate rounded-lg border px-2.5 py-1 text-xs transition",
                l.id === selected ? "border-[#ff7a1a] bg-[#ff7a1a]/10 text-zinc-100" : "border-ink-600 text-zinc-400 hover:text-zinc-200",
              ].join(" ")}
              style={l.image ? undefined : { fontFamily: `"${fontById(l.font).family}", sans-serif` }}
            >
              {l.image ? "🖼 Logo" : l.text.split("\n")[0] || "(trống)"}
            </button>
          ))}
          {design.layers.length === 0 && <p className="text-xs text-zinc-600">Chưa có gì — thêm 1 lớp ở trên.</p>}
        </div>
      </div>

      {sel && (
        <div className="space-y-3 rounded-xl border border-ink-700 bg-black/20 p-3">
          {sel.image ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={`Cỡ logo · ${Math.round(sel.size * 100)}% chiều cao`}>
                <input type="range" min={0.03} max={0.35} step={0.005} value={sel.size} onChange={(e) => patchSel({ size: Number(e.target.value) })} className="w-full accent-[#ff7a1a]" />
              </Field>
              <div className="flex items-end gap-4 text-xs text-zinc-400">
                <Check label="Bóng đổ" checked={sel.shadow} onChange={(shadow) => patchSel({ shadow })} />
              </div>
            </div>
          ) : (
            <>
              <textarea
                value={sel.text}
                onChange={(e) => patchSel({ text: e.target.value })}
                rows={2}
                className="w-full resize-y rounded-lg border border-ink-600 bg-ink-900 px-3 py-2 text-sm text-zinc-100 focus:border-[#ff7a1a]/70 focus:outline-none"
                placeholder="Nhập chữ (Enter để xuống dòng)"
              />
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Font">
                  <select
                    value={sel.font}
                    onChange={(e) => {
                      const f = fontById(e.target.value);
                      patchSel({ font: f.id, ...(f.kind === "cach-dieu" ? { upper: false } : {}) });
                    }}
                    className="w-full rounded-lg border border-ink-600 bg-ink-900 px-2 py-1.5 text-xs text-zinc-200"
                  >
                    <optgroup label="Chữ vuông">
                      {COVER_FONTS.filter((f) => f.kind === "vuong").map((f) => (
                        <option key={f.id} value={f.id}>{f.label}</option>
                      ))}
                    </optgroup>
                    <optgroup label="Chữ cách điệu">
                      {COVER_FONTS.filter((f) => f.kind === "cach-dieu").map((f) => (
                        <option key={f.id} value={f.id}>{f.label}</option>
                      ))}
                    </optgroup>
                  </select>
                </Field>
                <Field label={`Cỡ chữ · ${Math.round(sel.size * 1920)}px`}>
                  <input type="range" min={0.015} max={0.15} step={0.001} value={sel.size} onChange={(e) => patchSel({ size: Number(e.target.value) })} className="w-full accent-[#ff7a1a]" />
                </Field>
              </div>
              <Field label="Màu chữ">
                <ColorRow value={sel.color} onChange={(color) => patchSel({ color })} />
              </Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field
                  label="Viền chữ"
                  toggle={{ on: Boolean(sel.stroke), set: (on) => patchSel({ stroke: on ? sel.stroke ?? "#ffffff" : null, strokeWidth: on ? sel.strokeWidth || 0.07 : sel.strokeWidth }) }}
                >
                  {sel.stroke && (
                    <div className="space-y-2">
                      <ColorRow value={sel.stroke} onChange={(stroke) => patchSel({ stroke })} compact />
                      <input type="range" min={0.01} max={0.2} step={0.005} value={sel.strokeWidth} onChange={(e) => patchSel({ strokeWidth: Number(e.target.value) })} className="w-full accent-[#ff7a1a]" aria-label="Độ dày viền" />
                    </div>
                  )}
                </Field>
                <Field label="Nền nhãn" toggle={{ on: Boolean(sel.box), set: (on) => patchSel({ box: on ? "#ffd23f" : null }) }}>
                  {sel.box && <ColorRow value={sel.box} onChange={(box) => patchSel({ box })} compact />}
                </Field>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label={`Xoay · ${sel.rotate}°`}>
                  <input type="range" min={-30} max={30} step={1} value={sel.rotate} onChange={(e) => patchSel({ rotate: Number(e.target.value) })} className="w-full accent-[#ff7a1a]" />
                </Field>
                <div className="flex flex-wrap items-end gap-x-4 gap-y-2 text-xs text-zinc-400">
                  <Check label="Bóng đổ" checked={sel.shadow} onChange={(shadow) => patchSel({ shadow })} />
                  <Check label="IN HOA" checked={sel.upper} onChange={(upper) => patchSel({ upper })} />
                </div>
              </div>
            </>
          )}
          <div className="flex flex-wrap gap-1.5 border-t border-ink-700 pt-3">
            <SmallBtn onClick={() => patchSel({ x: 0.5 })}>Căn giữa</SmallBtn>
            <SmallBtn onClick={() => moveSel(1)}>Lên trên</SmallBtn>
            <SmallBtn onClick={() => moveSel(-1)}>Xuống dưới</SmallBtn>
            <SmallBtn onClick={duplicateSel}>Nhân đôi</SmallBtn>
            <SmallBtn onClick={removeSel} danger>Xoá lớp</SmallBtn>
          </div>
        </div>
      )}

      <Field label={`${darkenLabel} · ${Math.round(design.darken * 100)}%`}>
        <input type="range" min={0} max={0.8} step={0.05} value={design.darken} onChange={(e) => onChange({ ...design, darken: Number(e.target.value) })} className="w-full accent-[#ff7a1a]" />
      </Field>
    </div>
  );
}

export function Label({ children }: { children: ReactNode }) {
  return <p className="text-[11px] uppercase tracking-[0.15em] text-zinc-500">{children}</p>;
}

export function Field({ label, children, toggle }: { label: string; children?: ReactNode; toggle?: { on: boolean; set: (on: boolean) => void } }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-zinc-500">{label}</span>
        {toggle && (
          <button
            type="button"
            onClick={() => toggle.set(!toggle.on)}
            className={["rounded-full px-2 py-0.5 text-[10px]", toggle.on ? "bg-[#ff7a1a]/20 text-[#ffb27a]" : "bg-white/5 text-zinc-500"].join(" ")}
          >
            {toggle.on ? "Bật" : "Tắt"}
          </button>
        )}
      </div>
      {children}
    </div>
  );
}

function ColorRow({ value, onChange, compact }: { value: string; onChange: (c: string) => void; compact?: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {(compact ? SWATCHES.slice(0, 5) : SWATCHES).map((c) => (
        <button
          key={c}
          type="button"
          aria-label={c}
          onClick={() => onChange(c)}
          className={["h-6 w-6 rounded-full border-2 transition", value.toLowerCase() === c ? "border-white" : "border-transparent hover:border-zinc-500"].join(" ")}
          style={{ background: c }}
        />
      ))}
      <label className="relative h-6 w-6 cursor-pointer overflow-hidden rounded-full border border-ink-600" title="Màu khác">
        <span className="absolute inset-0" style={{ background: "conic-gradient(red, yellow, lime, cyan, blue, magenta, red)" }} />
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="absolute inset-0 cursor-pointer opacity-0" />
      </label>
    </div>
  );
}

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center gap-1.5">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="accent-[#ff7a1a]" />
      {label}
    </label>
  );
}

export function SmallBtn({ children, onClick, danger }: { children: ReactNode; onClick: () => void; danger?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "rounded-lg border border-ink-600 px-2.5 py-1 text-xs transition",
        danger ? "text-red-300/80 hover:border-red-400/60" : "text-zinc-300 hover:border-zinc-400 hover:text-zinc-100",
      ].join(" ")}
    >
      {children}
    </button>
  );
}
