import { Router } from "express";
import path from "node:path";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import multer from "multer";
import { config } from "../config.js";
import { AppError } from "../utils/AppError.js";
import {
  listSkills,
  getSkill,
  getSettings,
  setDefaultSkill,
  installFromGit,
  updateSkill,
  skillDir,
  pythonFor,
  readSkillMd,
  syncMusic,
} from "../services/skills/registry.js";

const router = Router();

async function requireSkill(req) {
  const skill = await getSkill(req.params.id);
  if (!skill) throw new AppError("Không tìm thấy skill.", 404, "SKILL_NOT_FOUND");
  return skill;
}

/** GET /api/skills — danh sách skill + skill mặc định */
router.get("/", async (_req, res) => {
  const [skills, settings] = await Promise.all([listSkills(), getSettings()]);
  res.json({ success: true, defaultSkill: settings.defaultSkill, skills });
});

/** POST /api/skills { repoUrl } — cài skill từ GitHub */
router.post("/", async (req, res) => {
  const skill = await installFromGit(req.body?.repoUrl);
  res.status(201).json({ success: true, skill });
});

/** PUT /api/skills/default { id | null } — skill dùng cho mọi lần edit (null = bộ cơ bản) */
router.put("/default", async (req, res) => {
  const id = req.body?.id ?? null;
  const settings = await setDefaultSkill(id === null ? null : String(id));
  res.json({ success: true, defaultSkill: settings.defaultSkill });
});

router.get("/:id", async (req, res) => {
  res.json({ success: true, skill: await requireSkill(req) });
});

/** GET /api/skills/:id/skill-md — nội dung SKILL.md */
router.get("/:id/skill-md", async (req, res) => {
  await requireSkill(req);
  res.type("text/markdown; charset=utf-8").send(await readSkillMd(req.params.id));
});

/** POST /api/skills/:id/update — git pull */
router.post("/:id/update", async (req, res) => {
  const result = await updateSkill(req.params.id);
  res.json({ success: true, ...result });
});

/** GET /api/skills/:id/preview — ảnh thư viện mẫu B-roll */
router.get("/:id/preview", async (req, res, next) => {
  const skill = await requireSkill(req);
  if (!skill.hasPreview) throw new AppError("Skill không có ảnh xem trước.", 404, "NO_PREVIEW");
  res.sendFile(path.join(skillDir(skill.id), "mau-broll", "_tat-ca.png"), (err) => {
    if (err && !res.headersSent) next(err);
  });
});

// ───── Nhạc nền theo loại video: thư mục nhac/nhac_nen_voice | nhac/nhac_nen_chill ─────
const MUSIC_FOLDER = { voice: ["nhac_nen_voice"], chill: ["nhac_nen_chill", "nhan_nen_chill"] };
const musicFolder = (id, cat) => {
  const base = path.join(skillDir(id), "nhac");
  const existing = MUSIC_FOLDER[cat].find((d) => existsSync(path.join(base, d)));
  return path.join(base, existing ?? MUSIC_FOLDER[cat][0]);
};

const musicUpload = multer({
  dest: config.tmpDir,
  limits: { fileSize: 300 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    const ok = /\.(mp3|wav|m4a|aac|flac|ogg|opus|mp4|mov|m4v|webm)$/i.test(file.originalname);
    cb(ok ? null : new AppError("Chỉ nhận file nhạc (mp3, wav, m4a…) hoặc video có tiếng (mp4, mov).", 415, "UNSUPPORTED_FILE_TYPE"), ok);
  },
}).single("music");

/** POST /api/skills/:id/music  (multipart: music + category=voice|chill) → chép vào thư mục loại đó → quét thư viện */
router.post("/:id/music", (req, res, next) => {
  musicUpload(req, res, async (err) => {
    if (err) return next(err);
    try {
      const skill = await requireSkill(req);
      if (!req.file) throw new AppError('Thiếu file nhạc (field "music").', 400, "NO_FILE");
      const category = req.body?.category;
      if (!["voice", "chill"].includes(category)) throw new AppError("category phải là voice hoặc chill.", 400, "INVALID_OPTION");
      if (!pythonFor(skillDir(skill.id))) throw new AppError("Skill chưa cài môi trường Python (npm run skill:setup).", 409, "SKILL_NOT_SETUP");

      const dir = musicFolder(skill.id, category);
      await fs.mkdir(dir, { recursive: true });
      const original = Buffer.from(req.file.originalname, "latin1").toString("utf8");
      const safe = path.basename(original).replace(/[\\/:*?"<>|]/g, "_");
      await fs.copyFile(req.file.path, path.join(dir, safe));
      const result = await syncMusic(skill.id);
      res.status(201).json({ success: true, message: result?.message ?? "", skill: await getSkill(skill.id) });
    } catch (e) {
      next(e);
    } finally {
      if (req.file?.path) await fs.rm(req.file.path, { force: true });
    }
  });
});

/** POST /api/skills/:id/music/sync — quét lại 2 thư mục nhạc (sau khi tự thả file vào bằng Finder) */
router.post("/:id/music/sync", async (req, res) => {
  const skill = await requireSkill(req);
  const result = await syncMusic(skill.id);
  if (!result) throw new AppError("Skill chưa cài môi trường Python hoặc thiếu thu_vien_nhac.py.", 409, "SKILL_NOT_SETUP");
  res.json({ success: true, message: result.message, skill: await getSkill(skill.id) });
});

export default router;
