/**
 * Nhận diện giọng nói → timestamp từng chữ, dùng OpenAI Whisper API.
 * Cần OPENAI_API_KEY trong .env. Giới hạn của API: file ≤ 25MB
 * (~70 phút với mp3 mono 48kbps mà ta tách ra).
 */
import fs from "node:fs/promises";
import { config } from "../../config.js";

const MAX_BYTES = 25 * 1024 * 1024;

export const transcriptionEnabled = () => Boolean(config.edit.openaiApiKey);

/** @returns {Promise<Array<{word:string,start:number,end:number}>>} */
export async function transcribeWords(audioPath, { signal } = {}) {
  const { openaiApiKey, whisperModel, transcribeLanguage } = config.edit;

  const buffer = await fs.readFile(audioPath);
  if (buffer.byteLength > MAX_BYTES) {
    throw new Error("Âm thanh quá dài để nhận diện (> 25MB). Bỏ qua bước chèn text.");
  }

  const form = new FormData();
  form.append("file", new Blob([buffer], { type: "audio/mpeg" }), "audio.mp3");
  form.append("model", whisperModel);
  form.append("response_format", "verbose_json");
  form.append("timestamp_granularities[]", "word");
  if (transcribeLanguage) form.append("language", transcribeLanguage);

  // Hết 10 phút mà chưa có kết quả → huỷ
  const timeout = AbortSignal.timeout(10 * 60 * 1000);
  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${openaiApiKey}` },
    body: form,
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Whisper API lỗi ${res.status}: ${body.slice(0, 300)}`);
  }

  const data = await res.json();
  return (data.words ?? [])
    .map((w) => ({ word: String(w.word).trim(), start: Number(w.start), end: Number(w.end) }))
    .filter((w) => w.word && Number.isFinite(w.start) && Number.isFinite(w.end));
}
