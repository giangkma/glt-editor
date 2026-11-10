import fs from "node:fs/promises";
import path from "node:path";
import { config } from "../config.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Chỉ chấp nhận UUID → chặn path traversal kiểu "../../etc/passwd" */
export const isValidId = (id) => typeof id === "string" && UUID_RE.test(id);

const metaPath = (id) => path.join(config.uploadDir, `${id}.json`);

export async function ensureUploadDir() {
  await Promise.all(
    [config.uploadDir, config.outputDir, config.tmpDir, config.projectsDir, config.skillsDir, config.dataDir].map((d) => fs.mkdir(d, { recursive: true })),
  );
}

/** Lưu metadata cạnh file video: uploads/<id>.json */
export async function saveMeta(meta) {
  await fs.writeFile(metaPath(meta.id), JSON.stringify(meta, null, 2), "utf8");
}

export async function getMeta(id) {
  if (!isValidId(id)) return null;
  try {
    return JSON.parse(await fs.readFile(metaPath(id), "utf8"));
  } catch (err) {
    if (err.code === "ENOENT") return null;
    throw err;
  }
}

/** Xoá file an toàn (không throw nếu file không tồn tại) */
export async function safeUnlink(filePath) {
  if (!filePath) return;
  try {
    await fs.unlink(filePath);
  } catch (err) {
    if (err.code !== "ENOENT") console.warn(`[cleanup] Không xoá được ${filePath}:`, err.message);
  }
}

/** Xoá file/thư mục tạm cũ hơn TTL trong uploads/, outputs/, tmp/, projects/ */
export async function cleanupExpired() {
  if (!config.uploadTtlMs) return;
  const now = Date.now();
  let removed = 0;
  for (const dir of [config.uploadDir, config.outputDir, config.tmpDir, config.projectsDir]) {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch (err) {
      if (err.code !== "ENOENT") console.error(`[cleanup] Không đọc được ${dir}:`, err.message);
      continue;
    }
    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      const full = path.join(dir, entry.name);
      try {
        const { mtimeMs } = await fs.stat(full);
        if (now - mtimeMs > config.uploadTtlMs) {
          await fs.rm(full, { recursive: true, force: true });
          removed++;
        }
      } catch {
        /* file có thể vừa bị xoá — bỏ qua */
      }
    }
  }
  if (removed) console.log(`[cleanup] Đã xoá ${removed} file tạm hết hạn`);
}
