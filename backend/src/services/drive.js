/**
 * Lấy video từ Google Drive (link chia sẻ "Bất kỳ ai có đường liên kết").
 *  - Link file:   https://drive.google.com/file/d/<ID>/view?...   (cũng nhận open?id=, uc?id=)
 *  - Link thư mục: https://drive.google.com/drive/(u/0/)folders/<ID>
 * Thư mục: có GOOGLE_API_KEY → Drive API v3; không có → đọc trang "embeddedfolderview" công khai.
 * Tải file: drive.usercontent.google.com (tự vượt trang "không quét được virus" của file lớn).
 */
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { config } from "../config.js";

const ID = "[A-Za-z0-9_-]{20,}";
const VIDEO_EXT = /\.(mp4|mov|m4v|webm|mkv|avi|mts|3gp)$/i;
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";

/** Tách link Drive trong đoạn văn bản (mỗi dòng / cách nhau bởi dấu cách, phẩy) */
export function parseDriveLinks(text) {
  const out = [];
  const seen = new Set();
  const bad = [];
  for (const raw of String(text ?? "").split(/[\s,;]+/).filter(Boolean)) {
    let m;
    let item = null;
    if ((m = raw.match(new RegExp(`/folders/(${ID})`)))) item = { type: "folder", id: m[1] };
    else if ((m = raw.match(new RegExp(`/file/d/(${ID})`)))) item = { type: "file", id: m[1] };
    else if ((m = raw.match(new RegExp(`[?&]id=(${ID})`))) && /google\.com/.test(raw)) item = { type: "file", id: m[1] };
    if (!item) {
      if (/^https?:\/\//.test(raw)) bad.push(raw);
      continue;
    }
    const key = `${item.type}:${item.id}`;
    if (!seen.has(key)) {
      seen.add(key);
      out.push(item);
    }
  }
  return { items: out, bad };
}

const decodeHtml = (s) =>
  s.replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));

/** Liệt kê video trong thư mục công khai → [{ id, name }] (theo thứ tự tên) */
export async function listFolder(folderId, { signal } = {}) {
  if (config.googleApiKey) {
    const files = [];
    let pageToken = "";
    do {
      const q = encodeURIComponent(`'${folderId}' in parents and trashed = false`);
      const url =
        `https://www.googleapis.com/drive/v3/files?q=${q}&fields=nextPageToken,files(id,name,mimeType,size)` +
        `&pageSize=1000&orderBy=name&supportsAllDrives=true&includeItemsFromAllDrives=true&key=${config.googleApiKey}` +
        (pageToken ? `&pageToken=${pageToken}` : "");
      const res = await fetch(url, { signal });
      if (!res.ok) throw new Error(`Drive API lỗi ${res.status} — thư mục đã chia sẻ "Bất kỳ ai có đường liên kết" chưa?`);
      const data = await res.json();
      for (const f of data.files ?? []) {
        if (f.mimeType?.startsWith("video/") || VIDEO_EXT.test(f.name)) files.push({ id: f.id, name: f.name, size: Number(f.size) || 0 });
      }
      pageToken = data.nextPageToken ?? "";
    } while (pageToken);
    return files;
  }

  // Không có API key: trang xem thư mục nhúng (công khai) — mỗi mục là 1 link /file/d/<id> kèm tên
  const res = await fetch(`https://drive.google.com/embeddedfolderview?id=${folderId}#list`, { headers: { "User-Agent": UA }, signal });
  if (!res.ok) throw new Error(`Không mở được thư mục Drive (HTTP ${res.status}) — thư mục đã chia sẻ công khai chưa?`);
  return parseEmbeddedFolder(await res.text());
}

/** Đọc HTML embeddedfolderview → video (tách riêng để test được) */
export function parseEmbeddedFolder(html) {
  const files = [];
  const seen = new Set();
  // Mỗi mục: <div class="flip-entry" id="entry-<ID>"> ... <div class="flip-entry-title">Tên file</div>
  const re = new RegExp(`id="entry-(${ID})"[\\s\\S]*?class="flip-entry-title"[^>]*>([\\s\\S]*?)</div>`, "g");
  let m;
  while ((m = re.exec(html))) {
    const id = m[1];
    const name = decodeHtml(m[2].replace(/<[^>]+>/g, "").trim());
    const block = html.slice(m.index, re.lastIndex);
    if (seen.has(id) || /\/folders\//.test(block)) continue; // bỏ thư mục con
    seen.add(id);
    files.push({ id, name, size: 0 });
  }
  if (!files.length && /ServiceLogin|accounts\.google\.com/.test(html)) {
    throw new Error("Thư mục Drive chưa chia sẻ công khai (cần “Bất kỳ ai có đường liên kết”).");
  }
  // Ưu tiên file có đuôi video; tên không có đuôi vẫn thử tải (kiểm tra lại sau khi tải)
  return files.filter((f) => VIDEO_EXT.test(f.name) || !/\.[a-z0-9]{2,4}$/i.test(f.name)).sort((a, b) => a.name.localeCompare(b.name, "vi", { numeric: true }));
}

function filenameFrom(res, fallback) {
  const cd = res.headers.get("content-disposition") ?? "";
  const star = cd.match(/filename\*=UTF-8''([^;]+)/i);
  if (star) return decodeURIComponent(star[1].replace(/"/g, ""));
  const plain = cd.match(/filename="?([^";]+)"?/i);
  return plain ? Buffer.from(plain[1], "latin1").toString("utf8") : fallback;
}

/**
 * Tải 1 file Drive về dest (ghi .part rồi đổi tên).
 * @returns {Promise<{ name: string, size: number, mimeType: string }>}
 */
export async function downloadFile(fileId, dest, { signal, onProgress, maxBytes = config.maxFileSize } = {}) {
  const base = `https://drive.usercontent.google.com/download?id=${fileId}&export=download&confirm=t`;
  let res = await fetch(base, { headers: { "User-Agent": UA }, redirect: "follow", signal });

  // File lớn: Google trả trang HTML "không quét được virus" kèm form xác nhận → gửi lại với uuid/confirm
  if (res.ok && (res.headers.get("content-type") ?? "").includes("text/html")) {
    const html = await res.text();
    const val = (n) => html.match(new RegExp(`name="${n}" value="([^"]*)"`))?.[1];
    if (val("uuid") || val("confirm")) {
      const url = `https://drive.usercontent.google.com/download?id=${fileId}&export=download&confirm=${val("confirm") ?? "t"}` +
        (val("uuid") ? `&uuid=${val("uuid")}` : "");
      res = await fetch(url, { headers: { "User-Agent": UA }, redirect: "follow", signal });
    } else if (/ServiceLogin|accounts\.google\.com|Request access|Yêu cầu quyền truy cập/i.test(html)) {
      throw new Error("File chưa chia sẻ công khai (cần “Bất kỳ ai có đường liên kết”).");
    } else {
      throw new Error("Google Drive không trả về file (link sai, file đã xoá hoặc bị giới hạn lượt tải).");
    }
  }
  if (!res.ok) {
    throw new Error(res.status === 404 ? "Không tìm thấy file trên Drive (link sai hoặc đã xoá)." : `Drive trả lỗi HTTP ${res.status}.`);
  }
  if ((res.headers.get("content-type") ?? "").includes("text/html")) {
    throw new Error("File chưa chia sẻ công khai hoặc Drive đang giới hạn lượt tải — thử lại sau.");
  }

  const total = Number(res.headers.get("content-length")) || 0;
  if (total && total > maxBytes) throw new Error(`File quá lớn (${Math.round(total / 1048576)} MB).`);
  const name = filenameFrom(res, `drive-${fileId}.mp4`);
  const part = `${dest}.part`;

  let got = 0;
  let lastPct = -1;
  const body = Readable.fromWeb(res.body);
  body.on("data", (chunk) => {
    got += chunk.length;
    if (got > maxBytes) body.destroy(new Error("File vượt giới hạn dung lượng."));
    const pct = total ? Math.floor((got / total) * 100) : -1;
    if (pct !== lastPct) {
      lastPct = pct;
      onProgress?.({ loaded: got, total, percent: pct });
    }
  });
  try {
    await pipeline(body, fs.createWriteStream(part));
  } catch (err) {
    await fsp.rm(part, { force: true });
    throw err;
  }
  await fsp.rename(part, dest);
  return { name, size: got, mimeType: res.headers.get("content-type") ?? "application/octet-stream" };
}

export const driveExt = (name) => {
  const ext = path.extname(name).toLowerCase();
  return VIDEO_EXT.test(ext) ? ext : ".mp4";
};
