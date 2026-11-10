"use client";

import type { ReactNode } from "react";
import { ICONS } from "@/lib/overlay/render";
import { fmtTime, retimeLine, TYPE_LABEL, type FontKey, type Item, type LineKind } from "@/lib/studio";
import { ColorDot, Ico, ICO, IconBtn, inputCls, Row, Section, Seg, Slider } from "./ui";

interface StudioInspectorProps {
  item: Item | null;
  time: number;
  jobId: string;
  landscape: boolean;
  onPatch: (p: Partial<Item>, record?: boolean) => void;
  onRemove: () => void;
  onDuplicate: () => void;
}

const KIND: [LineKind, string][] = [
  ["lead", "Chính"],
  ["sub", "Nhỏ"],
  ["cam", "Từ khoá"],
  ["hop", "Hộp"],
];
const ICON_LABEL: Record<string, string> = { check: "✓", cross: "✗", star: "★", heart: "♥", arrow: "↷", sparkle: "✦", fire: "🔥" };

/** Bảng thuộc tính bên phải (kiểu CapCut) */
export function StudioInspector({ item, time, onPatch, onRemove, onDuplicate }: StudioInspectorProps) {
  if (!item) {
    return (
      <aside className="flex min-h-0 flex-col items-center justify-center gap-3 border-l border-[#2a2a33] bg-[#16161b] p-8 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white/[0.04] text-[#55555f]">
          <Ico d={ICO.text} size={22} />
        </span>
        <p className="text-[13px] text-[#ececf1]">Chưa chọn gì</p>
        <p className="text-[11px] leading-relaxed text-[#8d8d98]">Bấm vào chữ trên video, trên timeline hoặc trong thư viện bên trái để chỉnh.</p>
      </aside>
    );
  }
  const p = (patch: Partial<Item>) => onPatch(patch);
  const color = (k: "color" | "accent", fallback: string, label: string) => (
    <div className="space-y-1.5">
      <p className="text-[11px] text-[#8d8d98]">{label}</p>
      <ColorDot value={item[k]} fallback={fallback} onChange={(v) => p({ [k]: v } as Partial<Item>)} onClear={() => p({ [k]: undefined } as Partial<Item>)} />
    </div>
  );

  return (
    <aside className="flex min-h-0 flex-col border-l border-[#2a2a33] bg-[#16161b]">
      <div className="flex items-center gap-2 border-b border-[#2a2a33] px-4 py-2.5">
        <span className="rounded bg-[#1fd3d9]/15 px-2 py-0.5 text-[11px] font-semibold text-[#1fd3d9]">{TYPE_LABEL[item.type]}</span>
        <span className="font-mono text-[10px] text-[#8d8d98]">
          {fmtTime(item.start)} → {fmtTime(item.end)}
        </span>
        <div className="ml-auto flex">
          <IconBtn title={item.hidden ? "Hiện" : "Ẩn"} onClick={() => p({ hidden: !item.hidden })}>
            <Ico d={item.hidden ? ICO.eyeOff : ICO.eye} size={15} />
          </IconBtn>
          <IconBtn title="Nhân đôi" onClick={onDuplicate}>
            <Ico d={ICO.copy} size={15} />
          </IconBtn>
          <IconBtn title="Xoá" onClick={onRemove} danger>
            <Ico d={ICO.trash} size={15} />
          </IconBtn>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {/* ── Nội dung ── */}
        <Section title={item.type === "image" ? "Ảnh" : "Nội dung"}>
          {item.type === "caption" && (
            <>
              {(item.lines ?? []).map((ln, li) => (
                <div key={li} className="space-y-1.5 rounded-md bg-[#0f0f13] p-2">
                  <input
                    value={ln.text}
                    onChange={(e) => {
                      const lines = [...(item.lines ?? [])];
                      lines[li] = retimeLine(ln, e.target.value, item.end);
                      onPatch({ lines });
                    }}
                    className={inputCls}
                  />
                  <div className="flex items-center gap-1.5">
                    <Seg<LineKind>
                      value={ln.kind}
                      onChange={(kind) => {
                        const lines = [...(item.lines ?? [])];
                        lines[li] = { ...ln, kind };
                        onPatch({ lines });
                      }}
                      options={KIND}
                    />
                    {(item.lines?.length ?? 0) > 1 && (
                      <IconBtn title="Bỏ dòng" onClick={() => onPatch({ lines: (item.lines ?? []).filter((_, i) => i !== li) })} danger>
                        <Ico d={ICO.close} size={13} />
                      </IconBtn>
                    )}
                  </div>
                </div>
              ))}
              <button
                type="button"
                onClick={() => {
                  const last = item.lines?.at(-1);
                  const t0 = Math.min(item.end - 0.2, (last?.words.at(-1)?.t ?? item.start) + 0.3);
                  onPatch({ lines: [...(item.lines ?? []), { text: "chữ mới", kind: "sub", words: [{ w: "chữ", t: t0 }, { w: "mới", t: t0 + 0.2 }] }] });
                }}
                className="w-full rounded-md border border-dashed border-[#34343f] py-1.5 text-[11px] text-[#c9c9d1] hover:border-[#1fd3d9]/70"
              >
                ＋ Thêm dòng
              </button>
            </>
          )}
          {item.type === "title" && (
            <>
              <textarea value={item.text ?? ""} onChange={(e) => p({ text: e.target.value })} rows={2} className={inputCls} placeholder="Bọc *chữ* để đổi màu nhấn" />
              <input value={item.sub ?? ""} onChange={(e) => p({ sub: e.target.value })} className={inputCls} placeholder="Dòng phụ (tuỳ chọn)" />
              <p className="text-[10px] text-[#55555f]">Mẹo: “Trekking *Đà Giang*” → chữ trong dấu * đổi sang màu nhấn</p>
            </>
          )}
          {item.type === "pill" && <textarea value={item.text ?? ""} onChange={(e) => p({ text: e.target.value })} rows={2} className={inputCls} />}
          {item.type === "card" && (
            <>
              <input value={item.title ?? ""} onChange={(e) => p({ title: e.target.value })} className={inputCls} placeholder="Tiêu đề thẻ" />
              <textarea value={item.sub ?? ""} onChange={(e) => p({ sub: e.target.value })} rows={2} className={inputCls} placeholder="Mô tả" />
            </>
          )}
          {(item.type === "icon" || item.type === "card") && (
            <div className="grid grid-cols-4 gap-1.5">
              {item.type === "card" && <IconTile on={!item.icon} onClick={() => p({ icon: "" })}>∅</IconTile>}
              {ICONS.map((ic) => (
                <IconTile key={ic} on={item.icon === ic} onClick={() => p({ icon: ic })}>
                  {ICON_LABEL[ic] ?? ic}
                </IconTile>
              ))}
            </div>
          )}
          {item.type === "image" && (
            <>
              <Slider label="Độ rộng" value={item.w ?? 0.6} min={0.2} max={1} step={0.01} onChange={(w) => p({ w })} fmt={(v) => `${Math.round(v * 100)}%`} />
              <Slider label="Bo góc" value={item.radius ?? 28} min={0} max={80} step={1} onChange={(radius) => p({ radius })} fmt={(v) => `${v}`} />
            </>
          )}
        </Section>

        {/* ── Kiểu ── */}
        {item.type !== "image" && (
          <Section title="Kiểu">
            {item.type === "title" && (
              <>
                <Row label="Font">
                  <Seg<FontKey> value={item.font ?? "phudu"} onChange={(font) => p({ font })} options={[["phudu", "DT Phudu"], ["inter", "Inter"], ["serif", "Nghiêng"]]} />
                </Row>
                <Row label="Căn">
                  <Seg value={item.align ?? "center"} onChange={(align) => p({ align: align as Item["align"] })} options={[["center", "Giữa"], ["left", "Trái"]]} />
                </Row>
              </>
            )}
            {item.type === "pill" && (
              <Row label="Font">
                <Seg<FontKey> value={item.font ?? "phudu"} onChange={(font) => p({ font })} options={[["phudu", "DT Phudu"], ["inter", "Inter"], ["serif", "Nghiêng"]]} />
              </Row>
            )}
            {item.type === "pill" && (
              <Row label="Kiểu">
                <Seg value={item.theme ?? "light"} onChange={(theme) => p({ theme })} options={[["light", "Sáng"], ["blue", "Xanh dương"]]} />
              </Row>
            )}
            {item.type === "card" && (
              <>
                <Row label="Nền">
                  <Seg value={item.theme ?? "navy"} onChange={(theme) => p({ theme })} options={[["navy", "Xanh đậm"], ["light", "Trắng"]]} />
                </Row>
                <Slider label="Độ rộng" value={item.w ?? 0.8} min={0.3} max={1} step={0.01} onChange={(w) => p({ w })} fmt={(v) => `${Math.round(v * 100)}%`} />
              </>
            )}
            {color("color", "#ffffff", item.type === "icon" ? "Màu sticker" : "Màu chữ")}
            {item.type !== "icon" && item.type !== "pill" &&
              color("accent", item.type === "title" ? "#ff7a1a" : item.type === "card" ? "#5ef2c2" : "#ff7a1a", item.type === "title" ? "Màu chữ nhấn (*…*)" : item.type === "card" ? "Màu tiêu đề thẻ" : "Màu nhấn (từ khoá, hộp)")}
          </Section>
        )}

        {/* ── Biến đổi ── */}
        <Section title="Vị trí & kích thước">
          <Slider label="Tỉ lệ" value={item.scale ?? 1} min={0.3} max={2.5} step={0.01} onChange={(scale) => p({ scale })} fmt={(v) => `${Math.round(v * 100)}%`} />
          {item.type !== "caption" && <Slider label="Xoay" value={item.rotate ?? 0} min={-30} max={30} step={0.5} onChange={(rotate) => p({ rotate })} fmt={(v) => `${v}°`} />}
          <Slider label="Ngang X" value={item.x ?? 0.5} min={0} max={1} step={0.005} onChange={(x) => p({ x })} fmt={(v) => `${Math.round(v * 100)}`} />
          <Slider label="Dọc Y" value={item.y ?? (item.type === "caption" ? 0.8 : 0.5)} min={0} max={1} step={0.005} onChange={(y) => p({ y })} fmt={(v) => `${Math.round(v * 100)}`} />
          <div className="flex flex-wrap gap-1.5">
            <Chip onClick={() => p({ x: 0.5 })}>Căn giữa ngang</Chip>
            {item.type === "caption" && item.y !== undefined && <Chip onClick={() => p({ y: undefined, x: 0.5 })}>Về vị trí phụ đề chung</Chip>}
          </div>
        </Section>

        {/* ── Thời gian ── */}
        <Section title="Thời gian">
          <div className="grid grid-cols-2 gap-2">
            <Num label="Bắt đầu" value={item.start} onChange={(start) => p({ start: Math.min(start, item.end - 0.1) })} />
            <Num label="Kết thúc" value={item.end} onChange={(end) => p({ end: Math.max(end, item.start + 0.1) })} />
          </div>
          <div className="flex flex-wrap gap-1.5">
            <Chip onClick={() => p({ start: Math.min(time, item.end - 0.1) })}>⇤ Bắt đầu tại đầu đọc</Chip>
            <Chip onClick={() => p({ end: Math.max(time, item.start + 0.1) })}>Kết thúc tại đầu đọc ⇥</Chip>
          </div>
        </Section>
      </div>
    </aside>
  );
}

function Num({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="block space-y-1">
      <span className="text-[10px] text-[#8d8d98]">{label} (giây)</span>
      <input
        type="number"
        step={0.1}
        min={0}
        value={Math.round(value * 100) / 100}
        onChange={(e) => Number.isFinite(Number(e.target.value)) && onChange(Number(e.target.value))}
        className={inputCls + " font-mono"}
      />
    </label>
  );
}

function Chip({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="rounded-md bg-[#0f0f13] px-2.5 py-1 text-[11px] text-[#c9c9d1] transition hover:bg-white/[0.08] hover:text-white">
      {children}
    </button>
  );
}

function IconTile({ children, on, onClick }: { children: ReactNode; on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={["flex aspect-square items-center justify-center rounded-md text-lg transition", on ? "bg-[#1fd3d9]/15 text-[#1fd3d9] ring-1 ring-[#1fd3d9]/70" : "bg-[#0f0f13] text-[#c9c9d1] hover:bg-white/[0.07]"].join(" ")}
    >
      {children}
    </button>
  );
}
