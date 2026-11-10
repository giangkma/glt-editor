"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Segmented } from "@/components/edit/EditOptions";
import { DesignCanvas } from "@/components/cover/DesignCanvas";
import { DesignControls, Field, Label } from "@/components/cover/DesignControls";
import { deleteCta, fetchBrand, saveBrandInfo, saveCta, type Brand } from "@/lib/brand";
import { ORANGE, layerOf, renderOverlay, type CoverDesign } from "@/lib/cover";

const CTA_TEMPLATES: { id: string; label: string; make: () => CoverDesign }[] = [
  {
    id: "dat-tour",
    label: "Đặt tour + SĐT",
    make: () => ({
      darken: 0,
      layers: [
        layerOf("cach-dieu", { text: "Liên hệ đặt tour", size: 0.045, y: 0.42 }),
        layerOf("vuong", { text: "0342 859 396", size: 0.07, y: 0.5 }),
        layerOf("nhan", { text: "Nhắn tin ngay", size: 0.035, rotate: 0, x: 0.5, y: 0.6, box: ORANGE, color: "#ffffff" }),
      ],
    }),
  },
  {
    id: "follow",
    label: "Follow kênh",
    make: () => ({
      darken: 0,
      layers: [
        layerOf("vuong", { text: "FOLLOW ĐỂ XEM", size: 0.05, color: "#ffffff", stroke: null, y: 0.44 }),
        layerOf("cach-dieu", { text: "hành trình tiếp theo", size: 0.045, y: 0.51 }),
      ],
    }),
  },
];

/** Trang Thương hiệu: tên / SĐT / hashtag (AI dùng khi viết caption) + đoạn kết CTA gắn cuối mọi video */
export function BrandManager() {
  const [brand, setBrand] = useState<Brand | null>(null);
  const [info, setInfo] = useState({ name: "", phone: "", hashtags: "" });
  const [design, setDesign] = useState<CoverDesign>(() => CTA_TEMPLATES[0].make());
  const [selected, setSelected] = useState<string | null>(null);
  const [enabled, setEnabled] = useState(true);
  const [duration, setDuration] = useState("2");
  const [bgDark, setBgDark] = useState(0.5);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetchBrand()
      .then((b) => {
        setBrand(b);
        setInfo({ name: b.name, phone: b.phone, hashtags: b.hashtags });
        if (b.cta.design) setDesign(b.cta.design);
        setEnabled(b.hasCta ? b.cta.enabled : true);
        setDuration(String(b.cta.duration));
        setBgDark(b.cta.darken);
      })
      .catch((e) => setError(e.message));
  }, []);

  const flash = (m: string) => {
    setMsg(m);
    setTimeout(() => setMsg(null), 2500);
  };

  const saveInfo = async () => {
    setError(null);
    try {
      setBrand(await saveBrandInfo(info));
      flash("Đã lưu thông tin thương hiệu");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Lỗi lưu");
    }
  };

  const save = async () => {
    setError(null);
    setBusy(true);
    try {
      const overlay = await renderOverlay(design);
      setBrand(await saveCta({ overlay, design, enabled, duration: Number(duration), darken: bgDark }));
      flash(enabled ? "Đã lưu — đoạn kết sẽ gắn vào cuối mọi video" : "Đã lưu (đang tắt)");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Lỗi lưu");
    } finally {
      setBusy(false);
    }
  };

  if (!brand && !error) return <div className="h-40 animate-pulse rounded-2xl bg-ink-900/60" />;

  return (
    <div className="space-y-8">
      <section className="space-y-4 rounded-2xl border border-ink-700 bg-ink-900/60 p-5">
        <Label>Thông tin thương hiệu — AI dùng khi viết caption</Label>
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label="Tên thương hiệu / kênh" value={info.name} onChange={(name) => setInfo({ ...info, name })} placeholder="Rừng Adventure" />
          <Input label="SĐT / Zalo" value={info.phone} onChange={(phone) => setInfo({ ...info, phone })} placeholder="0342 859 396" />
        </div>
        <Input label="Hashtag riêng (luôn thêm)" value={info.hashtags} onChange={(hashtags) => setInfo({ ...info, hashtags })} placeholder="#rungadventure #dagiang" />
        <div className="flex justify-end">
          <Button variant="ghost" onClick={saveInfo}>Lưu thông tin</Button>
        </div>
      </section>

      <section className="space-y-4">
        <div className="space-y-1">
          <h2 className="text-lg font-medium text-zinc-100">Đoạn kết kêu gọi (CTA)</h2>
          <p className="text-sm text-zinc-500">
            Gắn vào cuối mọi video: khung cuối đứng hình, mờ nền, logo + chữ hiện dần. Tắt cho từng video ở mục “Nâng cao chất lượng”.
          </p>
        </div>
        <div className="grid gap-6 rounded-2xl border border-ink-700 bg-ink-900/60 p-4 sm:p-5 md:grid-cols-[minmax(0,300px)_1fr]">
          <div className="mx-auto w-full max-w-[300px] space-y-2">
            <DesignCanvas
              design={design}
              selected={selected}
              onSelect={setSelected}
              onMove={(id, p) => setDesign((d) => ({ ...d, layers: d.layers.map((l) => (l.id === id ? { ...l, ...p } : l)) }))}
            >
              {/* Nền mẫu: giống khung cuối video đã làm mờ + tối */}
              <div
                className="absolute inset-0"
                style={{
                  background: "linear-gradient(160deg,#3d6b3a 0%,#1f3d2b 40%,#7a5a2e 100%)",
                  filter: `blur(6px) brightness(${1 - bgDark * 0.35})`,
                  transform: "scale(1.1)",
                }}
              />
            </DesignCanvas>
            <p className="text-center text-[11px] text-zinc-600">Nền thật = khung cuối của từng video, làm mờ</p>
          </div>
          <div className="min-w-0 space-y-4">
            <DesignControls
              design={design}
              onChange={setDesign}
              selected={selected}
              onSelect={setSelected}
              templates={CTA_TEMPLATES}
              darkenLabel="Làm tối thêm trên/dưới"
            />
            <div className="grid gap-4 border-t border-ink-700 pt-4 sm:grid-cols-2">
              <Field label="Thời lượng đoạn kết">
                <Segmented value={duration} onChange={setDuration} options={[{ v: "1.5", label: "1,5s" }, { v: "2", label: "2s" }, { v: "3", label: "3s" }]} />
              </Field>
              <Field label={`Độ tối nền · ${Math.round(bgDark * 100)}%`}>
                <input type="range" min={0} max={0.85} step={0.05} value={bgDark} onChange={(e) => setBgDark(Number(e.target.value))} className="w-full accent-[#ff7a1a]" />
              </Field>
            </div>
            <label className="flex cursor-pointer items-center gap-2 text-sm text-zinc-300">
              <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="accent-[#c6ff3d]" />
              Tự gắn đoạn kết vào mọi video
            </label>
            <div className="flex flex-wrap items-center gap-3">
              <Button disabled={busy || design.layers.length === 0} onClick={save}>{busy ? "Đang lưu…" : "Lưu đoạn kết"}</Button>
              {brand?.hasCta && (
                <button
                  type="button"
                  onClick={async () => setBrand(await deleteCta())}
                  className="text-xs text-zinc-500 hover:text-red-300"
                >
                  Xoá đoạn kết
                </button>
              )}
              {msg && <span className="text-xs text-accent">{msg}</span>}
            </div>
          </div>
        </div>
      </section>
      {error && <p className="text-sm text-red-400">{error}</p>}
    </div>
  );
}

function Input({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-[11px] text-zinc-500">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-ink-600 bg-ink-900 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-accent/60 focus:outline-none"
      />
    </label>
  );
}
