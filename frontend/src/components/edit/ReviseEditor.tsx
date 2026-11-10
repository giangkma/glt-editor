"use client";

import { useEffect, useMemo, useState } from "react";
import { fetchScript } from "@/lib/edit";
import { musicLabel } from "@/lib/skills";
import { Button } from "@/components/ui/Button";
import type { EditJob, EditScript, ReviseEdits } from "@/types/edit";

interface ReviseEditorProps {
  job: EditJob;
  onRevise: (edits: ReviseEdits) => void;
}

/** Chỉnh nhanh bản nháp: sửa chữ, bỏ cảnh, đổi nhạc → dựng lại không gọi AI */
export function ReviseEditor({ job, onRevise }: ReviseEditorProps) {
  const [script, setScript] = useState<EditScript | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lines, setLines] = useState<Record<string, string>>({});
  const [removed, setRemoved] = useState<Set<number>>(new Set());
  const [music, setMusic] = useState<string | null>(null);
  const [hookOff, setHookOff] = useState(false);

  useEffect(() => {
    fetchScript(job.id)
      .then(setScript)
      .catch((err) => setError(err instanceof Error ? err.message : "Không đọc được kịch bản."));
  }, [job.id]);

  const edits = useMemo<ReviseEdits>(() => {
    if (!script) return {};
    const e: ReviseEdits = {};
    if (script.mode === "voice") {
      const changed = Object.fromEntries(
        Object.entries(lines).filter(([k, v]) => {
          const [ci, li] = k.split(".").map(Number);
          return v.trim() && v.trim() !== script.clusters[ci][li].text;
        }),
      );
      if (Object.keys(changed).length) e.lines = changed;
      if (removed.size) e.removeScenes = [...removed];
      if (hookOff) e.hook = false;
    } else if (removed.size) e.removeShots = [...removed];
    if (music !== null && music !== script.music) e.music = music;
    return e;
  }, [script, lines, removed, music, hookOff]);
  const dirty = Object.keys(edits).length > 0;

  if (error) return <p className="text-xs text-red-400">{error}</p>;
  if (!script) return <div className="h-24 animate-pulse rounded-2xl bg-ink-900/60" />;

  const toggle = (i: number) =>
    setRemoved((s) => {
      const n = new Set(s);
      if (n.has(i)) n.delete(i);
      else n.add(i);
      return n;
    });

  return (
    <div className="space-y-4 rounded-2xl border border-ink-700 bg-ink-900/60 p-5">
      <label className="flex flex-wrap items-center gap-2 text-xs text-zinc-400">
        Nhạc nền
        <select
          value={music ?? script.music}
          onChange={(e) => setMusic(e.target.value)}
          className="max-w-[16rem] rounded-lg border border-ink-600 bg-ink-900 px-2 py-1 text-xs text-zinc-200"
        >
          {script.mode === "voice" && <option value="">Không nhạc</option>}
          {[...new Set([script.music, ...script.musicOptions].filter(Boolean))].map((m) => (
            <option key={m} value={m}>{musicLabel(m)}</option>
          ))}
        </select>
      </label>

      {script.mode === "voice" ? (
        <>
          {script.hook && (
            <label className="flex items-center gap-2 text-xs text-zinc-400">
              <input type="checkbox" checked={hookOff} onChange={(e) => setHookOff(e.target.checked)} className="accent-[#c6ff3d]" />
              Bỏ câu móc ở đầu video
            </label>
          )}
          <div className="space-y-1.5">
            <p className="text-[11px] uppercase tracking-[0.12em] text-zinc-500">Phụ đề — sửa chữ sai rồi dựng lại</p>
            <div className="max-h-72 space-y-1.5 overflow-y-auto pr-1">
              {script.clusters.map((c, ci) => (
                <div key={ci} className="flex gap-2">
                  <span className="w-6 shrink-0 pt-1.5 text-right font-mono text-[11px] text-zinc-600">{ci + 1}</span>
                  <div className="flex min-w-0 flex-1 flex-wrap gap-1.5">
                    {c.map((l, li) => {
                      const key = `${ci}.${li}`;
                      const v = lines[key] ?? l.text;
                      return (
                        <input
                          key={key}
                          value={v}
                          onChange={(e) => setLines((s) => ({ ...s, [key]: e.target.value }))}
                          size={Math.max(4, v.length + 1)}
                          className={[
                            "min-w-0 rounded-lg border bg-black/30 px-2 py-1 text-xs focus:outline-none",
                            v !== l.text ? "border-accent/70 text-zinc-100" : "border-ink-700",
                            l.emphasis === "cam" ? "text-[#ff9f43]" : l.emphasis === "hop" ? "font-semibold text-[#ff9f43]" : "text-zinc-300",
                          ].join(" ")}
                        />
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
          {script.scenes.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[11px] uppercase tracking-[0.12em] text-zinc-500">Cảnh không lời — tick để bỏ</p>
              {script.scenes.map((sc, i) => (
                <label key={i} className="flex cursor-pointer items-center gap-2 text-xs text-zinc-400">
                  <input type="checkbox" checked={removed.has(i)} onChange={() => toggle(i)} className="accent-red-400" />
                  <span className={removed.has(i) ? "line-through opacity-60" : ""}>
                    <span className="font-mono text-zinc-500">{sc.start.toFixed(1)}–{sc.end.toFixed(1)}s</span> {sc.reason}
                  </span>
                </label>
              ))}
            </div>
          )}
        </>
      ) : (
        <div className="space-y-1.5">
          <p className="text-[11px] uppercase tracking-[0.12em] text-zinc-500">Cảnh montage — tick để bỏ (cảnh còn lại tự khớp nhịp)</p>
          <div className="max-h-72 space-y-1 overflow-y-auto pr-1">
            {script.shots.map((sh, i) => (
              <label key={i} className="flex cursor-pointer items-center gap-2 text-xs text-zinc-400">
                <input type="checkbox" checked={removed.has(i)} onChange={() => toggle(i)} className="accent-red-400" />
                <span className={removed.has(i) ? "line-through opacity-60" : ""}>
                  <span className="font-mono text-zinc-500">#{i + 1} {sh.start.toFixed(1)}s · {sh.beats} nhịp</span> {sh.reason}
                </span>
              </label>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center justify-end gap-3">
        {!dirty && <span className="text-[11px] text-zinc-600">Chưa có thay đổi</span>}
        <Button disabled={!dirty} onClick={() => onRevise(edits)}>Dựng lại bản nháp</Button>
      </div>
    </div>
  );
}
