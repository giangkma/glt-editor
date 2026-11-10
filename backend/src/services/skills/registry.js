/**
 * Kho skill của web: mỗi skill là 1 thư mục trong backend/skills/<tên>
 * (đúng cấu trúc repo GitHub: SKILL.md + scripts/ ...).
 *
 * - Cài từ GitHub (git clone), cập nhật (git pull)
 * - Ghi nhớ skill mặc định trong data/settings.json → mọi lần edit sau tự dùng
 * - Kiểm tra môi trường (Python, font, mô hình tách phông, nhạc nền)
 */
import fs from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { config } from "../../config.js";
import { AppError } from "../../utils/AppError.js";

const execFileP = promisify(execFile);
// GIT_TERMINAL_PROMPT=0: repo sai/riêng tư thì báo lỗi ngay thay vì treo chờ nhập mật khẩu
const exec = (cmd, args, opts = {}) =>
  execFileP(cmd, args, { ...opts, env: { ...process.env, GIT_TERMINAL_PROMPT: "0" } });
const ID_RE = /^[a-z0-9][a-z0-9._-]{0,63}$/i;
const settingsPath = () => path.join(config.dataDir, "settings.json");

// ───────────── Cài đặt chung (skill mặc định) ─────────────

export async function getSettings() {
  try {
    return JSON.parse(await fs.readFile(settingsPath(), "utf8"));
  } catch {
    return { defaultSkill: null };
  }
}

async function saveSettings(patch) {
  const next = { ...(await getSettings()), ...patch };
  await fs.mkdir(config.dataDir, { recursive: true });
  // Ghi ra file tạm rồi đổi tên → không bao giờ để file cài đặt bị hỏng giữa chừng
  const tmp = settingsPath() + ".tmp";
  await fs.writeFile(tmp, JSON.stringify(next, null, 2), "utf8");
  await fs.rename(tmp, settingsPath());
  return next;
}

export async function setDefaultSkill(id) {
  if (id !== null) {
    const skill = await getSkill(id);
    if (!skill) throw new AppError("Không tìm thấy skill.", 404, "SKILL_NOT_FOUND");
    if (!skill.runnable) throw new AppError("Web chưa chạy được skill này (thiếu bộ máy dựng).", 400, "SKILL_NOT_RUNNABLE");
  }
  return saveSettings({ defaultSkill: id });
}

// ───────────── Đọc thông tin skill ─────────────

export const skillDir = (id) => path.join(config.skillsDir, id);

/** Đọc phần đầu YAML của SKILL.md (name, description) */
export function parseFrontmatter(md) {
  const m = md.match(/^---\s*\n([\s\S]*?)\n---/);
  const out = {};
  if (!m) return out;
  for (const line of m[1].split("\n")) {
    const kv = line.match(/^(\w[\w-]*):\s*(.*)$/);
    if (!kv) continue;
    let v = kv[2].trim();
    if ((v.startsWith("'") && v.endsWith("'")) || (v.startsWith('"') && v.endsWith('"'))) {
      v = v.slice(1, -1).replace(/''/g, "'");
    }
    out[kv[1]] = v;
  }
  return out;
}

/** Python của skill: SKILL_PYTHON → <skill>/venv (Mac/Linux hoặc Windows) */
export function pythonFor(dir) {
  if (config.skill.pythonPath) return config.skill.pythonPath;
  const candidates = [path.join(dir, "venv", "bin", "python"), path.join(dir, "venv", "Scripts", "python.exe")];
  return candidates.find((p) => existsSync(p)) ?? null;
}

/**
 * Danh sách mẫu B-roll 3D trong reel_engine.py (class B... + chữ ký __init__)
 * → đưa cho Claude để chọn đúng tên + tham số.
 */
export function readTemplates(dir) {
  const file = path.join(dir, "scripts", "reel_engine.py");
  if (!existsSync(file)) return [];
  const src = readFileSync(file, "utf8");
  const out = [];
  const re = /^class (B\w+)\s*(?:\([^)]*\))?:\s*(#.*)?$/gm;
  let m;
  while ((m = re.exec(src))) {
    const name = m[1];
    if (name === "BUser") continue; // cảnh quay của người dùng — web chưa hỗ trợ tải lên
    const initAt = src.indexOf("def __init__(self", m.index);
    const nextClass = src.indexOf("\nclass ", m.index + 1);
    if (initAt === -1 || (nextClass !== -1 && initAt > nextClass)) continue;
    // Lấy chữ ký tới dấu ")" khớp ngoặc (chữ ký có thể dài nhiều dòng)
    let depth = 0;
    let end = initAt;
    for (let i = src.indexOf("(", initAt); i < src.length; i++) {
      if (src[i] === "(") depth++;
      else if (src[i] === ")" && --depth === 0) {
        end = i;
        break;
      }
    }
    const sig = src.slice(src.indexOf("(", initAt) + 1, end).replace(/\s+/g, " ").replace(/^self,\s*/, "");
    const params = [...sig.matchAll(/(?:^|,\s*)(\w+)\s*=/g)].map((x) => x[1]);
    out.push({ name, signature: sig, params, comment: (m[2] ?? "").replace(/^#\s*/, "") });
  }
  return out;
}

export async function listMusic(dir) {
  try {
    const files = await fs.readdir(path.join(dir, "nhac"));
    return files.filter((f) => f.endsWith("_grid.json")).map((f) => f.replace(/_grid\.json$/, "")).sort();
  } catch {
    return [];
  }
}

/**
 * Nhạc theo loại video (thu_vien_nhac.py ghi nhac/_thu_vien.json):
 *   voice = nhạc cho video có lời thuyết minh (thư mục nhac/nhac_nen_voice)
 *   chill = nhạc cho video chill không lời (thư mục nhac/nhac_nen_chill)
 *   other = bài thêm kiểu cũ, không thuộc thư mục nào
 */
export async function musicCategories(dir) {
  let man = { tracks: {} };
  try {
    man = JSON.parse(await fs.readFile(path.join(dir, "nhac", "_thu_vien.json"), "utf8"));
  } catch {
    /* chưa quét lần nào */
  }
  const cats = { voice: [], chill: [], other: [] };
  for (const name of await listMusic(dir)) {
    const cat = man.tracks?.[name]?.cat;
    (cats[cat] ?? cats.other).push(name);
  }
  return cats;
}

/** Quét 2 thư mục nhạc → chuẩn bị + phân tích nhịp bài mới (bài đã xử lý thì bỏ qua, chạy rất nhanh) */
export async function syncMusic(id, { signal, onLine } = {}) {
  const dir = skillDir(id);
  const script = path.join(dir, "scripts", "thu_vien_nhac.py");
  const python = pythonFor(dir);
  if (!existsSync(script) || !python) return null;
  const { runPython } = await import("./python.js");
  const lines = await runPython(python, [script], { cwd: path.dirname(script), signal, label: "thu_vien_nhac", onLine });
  return { message: lines.find((l) => l.startsWith("xong:")) ?? "", cats: await musicCategories(dir) };
}

async function gitInfo(dir) {
  try {
    const { stdout } = await exec("git", ["-C", dir, "log", "-1", "--format=%h|%cI|%s"]);
    const [commit, date, subject] = stdout.trim().split("|");
    const { stdout: remote } = await exec("git", ["-C", dir, "remote", "get-url", "origin"]);
    return { commit, date, subject, remote: remote.trim() };
  } catch {
    return null;
  }
}

export async function getSkill(id) {
  if (!ID_RE.test(id ?? "")) return null;
  const dir = skillDir(id);
  const mdPath = path.join(dir, "SKILL.md");
  if (!existsSync(mdPath)) return null;

  const md = await fs.readFile(mdPath, "utf8");
  const fm = parseFrontmatter(md);
  const scripts = ["go_bang.py", "reel_engine.py", "mix_engine.py", "thu_broll.py"];
  const runnable = scripts.every((s) => existsSync(path.join(dir, "scripts", s)));
  const python = pythonFor(dir);
  const settings = await getSettings();

  return {
    id,
    name: fm.name ?? id,
    description: fm.description ?? "",
    runnable,
    engine: runnable ? "reel-doc-3d" : null,
    isDefault: settings.defaultSkill === id,
    hasPreview: existsSync(path.join(dir, "mau-broll", "_tat-ca.png")),
    templates: runnable ? readTemplates(dir).map((t) => t.name) : [],
    music: await listMusic(dir),
    musicCats: await musicCategories(dir),
    status: {
      python: Boolean(python),
      fonts: existsSync(path.join(dir, "fonts", "InterTight-VF.ttf")),
      phudu: existsSync(path.join(dir, "fonts", "Phudu-VF.ttf")),
      matteModel: existsSync(path.join(dir, "models", "rvm_resnet50_fp32.onnx")),
    },
    git: await gitInfo(dir),
  };
}

export async function readSkillMd(id) {
  return fs.readFile(path.join(skillDir(id), "SKILL.md"), "utf8");
}

export async function listSkills() {
  await fs.mkdir(config.skillsDir, { recursive: true });
  const entries = await fs.readdir(config.skillsDir, { withFileTypes: true });
  const skills = [];
  for (const e of entries) {
    if (!e.isDirectory() || e.name.startsWith(".")) continue;
    const s = await getSkill(e.name);
    if (s) skills.push(s);
  }
  return skills;
}

/** Skill dùng cho lần edit: id được chọn → skill mặc định → null (dùng bộ edit cơ bản) */
export async function resolveSkill(id) {
  const settings = await getSettings();
  const target = id === undefined ? settings.defaultSkill : id;
  if (!target) return null;
  const skill = await getSkill(target);
  if (!skill) throw new AppError(`Không tìm thấy skill "${target}".`, 404, "SKILL_NOT_FOUND");
  if (!skill.runnable) throw new AppError(`Web chưa chạy được skill "${target}".`, 400, "SKILL_NOT_RUNNABLE");
  return skill;
}

// ───────────── Cài / cập nhật từ GitHub ─────────────

function normalizeGitUrl(raw) {
  let url;
  try {
    url = new URL(String(raw).trim());
  } catch {
    throw new AppError("Link không hợp lệ.", 400, "INVALID_URL");
  }
  if (url.protocol !== "https:" || url.hostname !== "github.com") {
    throw new AppError("Chỉ hỗ trợ link https://github.com/<tài khoản>/<repo>.", 400, "INVALID_URL");
  }
  const [owner, repo] = url.pathname.split("/").filter(Boolean);
  if (!owner || !repo || !/^[\w.-]+$/.test(owner) || !/^[\w.-]+$/.test(repo)) {
    throw new AppError("Link GitHub phải có dạng https://github.com/<tài khoản>/<repo>.", 400, "INVALID_URL");
  }
  return `https://github.com/${owner}/${repo.replace(/\.git$/, "")}.git`;
}

export async function installFromGit(rawUrl) {
  const url = normalizeGitUrl(rawUrl);
  await fs.mkdir(config.skillsDir, { recursive: true });
  const tmp = path.join(config.skillsDir, `.tmp-${Date.now()}`);
  try {
    await exec("git", ["clone", "--depth", "1", url, tmp], { timeout: 5 * 60 * 1000 });
  } catch (err) {
    await fs.rm(tmp, { recursive: true, force: true });
    throw new AppError(`Không tải được repo: ${err.stderr?.trim() || err.message}`, 502, "GIT_CLONE_FAILED");
  }

  try {
    const mdPath = path.join(tmp, "SKILL.md");
    if (!existsSync(mdPath)) throw new AppError("Repo không có file SKILL.md ở thư mục gốc.", 400, "NOT_A_SKILL");
    const fm = parseFrontmatter(await fs.readFile(mdPath, "utf8"));
    const id = (fm.name ?? "").toLowerCase();
    if (!ID_RE.test(id)) throw new AppError("SKILL.md thiếu tên hợp lệ (name:).", 400, "NOT_A_SKILL");
    if (existsSync(skillDir(id))) {
      throw new AppError(`Skill "${id}" đã có — dùng nút Cập nhật.`, 409, "SKILL_EXISTS");
    }
    await fs.rename(tmp, skillDir(id));
    // Skill đầu tiên chạy được → tự đặt làm mặc định
    const settings = await getSettings();
    const skill = await getSkill(id);
    if (!settings.defaultSkill && skill.runnable) await saveSettings({ defaultSkill: id });
    return getSkill(id);
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
}

export async function updateSkill(id) {
  const skill = await getSkill(id);
  if (!skill) throw new AppError("Không tìm thấy skill.", 404, "SKILL_NOT_FOUND");
  if (!skill.git) throw new AppError("Skill này không cài từ GitHub nên không cập nhật được.", 400, "NOT_GIT");
  try {
    // --ff-only: không bao giờ ghi đè chỗ bạn đã sửa trong skill (vd mẫu B-roll mới)
    const { stdout } = await exec("git", ["-C", skillDir(id), "pull", "--ff-only"], { timeout: 5 * 60 * 1000 });
    return { skill: await getSkill(id), output: stdout.trim() };
  } catch (err) {
    throw new AppError(`Không cập nhật được: ${err.stderr?.trim() || err.message}`, 502, "GIT_PULL_FAILED");
  }
}
