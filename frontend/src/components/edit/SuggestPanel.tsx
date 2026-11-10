"use client";

import { useEffect, useState } from "react";
import { fetchSuggestions, makeSuggestions } from "@/lib/edit";
import type { EditJob, PostSuggestions } from "@/types/edit";

interface SuggestPanelProps {
  job: EditJob;
  /** Bấm "Dùng cho ảnh bìa" → điền vào trình làm bìa */
  onUseCoverTitle: (t: { script: string; block: string }) => void;
}

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  }
}

/** AI gợi ý đăng bài: caption + hashtag + chữ ảnh bìa */
export function SuggestPanel({ job, onUseCoverTitle }: SuggestPanelProps) {
  const [data, setData] = useState<PostSuggestions | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<number | null>(null);

  useEffect(() => {
    fetchSuggestions(job.id).then(setData).catch(() => {});
  }, [job.id]);

  const run = async () => {
    setError(null);
    setLoading(true);
    try {
      setData(await makeSuggestions(job.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "AI chưa viết được gợi ý.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4 rounded-2xl border border-ink-700 bg-ink-900/60 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-zinc-100">AI gợi ý đăng bài</p>
          <p className="text-xs text-zinc-500">Caption, hashtag và chữ cho ảnh bìa — AI xem video rồi viết</p>
        </div>
        <button
          type="button"
          onClick={run}
          disabled={loading}
          className="rounded-full border border-ink-600 px-4 py-2 text-xs text-zinc-200 transition hover:border-accent disabled:opacity-50"
        >
          {loading ? "AI đang xem video…" : data ? "Viết lại" : "✦ Viết gợi ý"}
        </button>
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}

      {data && (
        <>
          <ul className="space-y-2.5">
            {data.captions.map((c, i) => {
              const full = `${c.text}\n\n${c.hashtags.join(" ")}`;
              return (
                <li key={i} className="rounded-xl border border-ink-700 bg-black/20 p-3">
                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <span className="text-[11px] uppercase tracking-[0.12em] text-zinc-500">{c.style || `Phương án ${i + 1}`}</span>
                    <button
                      type="button"
                      onClick={async () => {
                        if (await copy(full)) {
                          setCopied(i);
                          setTimeout(() => setCopied((x) => (x === i ? null : x)), 1500);
                        }
                      }}
                      className="rounded-full bg-white/5 px-3 py-1 text-[11px] text-zinc-300 hover:bg-white/10"
                    >
                      {copied === i ? "Đã chép ✓" : "Chép"}
                    </button>
                  </div>
                  <p className="whitespace-pre-line text-sm text-zinc-200">{c.text}</p>
                  <p className="mt-1.5 text-xs text-[#ff9f43]">{c.hashtags.join(" ")}</p>
                </li>
              );
            })}
          </ul>
          {data.coverTitles.length > 0 && (
            <div className="space-y-2">
              <p className="text-[11px] uppercase tracking-[0.12em] text-zinc-500">Chữ cho ảnh bìa</p>
              <div className="flex flex-wrap gap-2">
                {data.coverTitles.map((t, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => onUseCoverTitle(t)}
                    className="rounded-xl border border-ink-600 px-3 py-2 text-left transition hover:border-[#ff7a1a]"
                    title="Dùng cho ảnh bìa"
                  >
                    <span className="block text-[11px] italic text-zinc-400">{t.script}</span>
                    <span className="block text-xs font-semibold uppercase text-[#ff9f43]">{t.block}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
