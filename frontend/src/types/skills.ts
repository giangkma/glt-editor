export interface Skill {
  id: string;
  name: string;
  description: string;
  /** Web chạy được (có bộ máy dựng reel_engine/mix_engine) */
  runnable: boolean;
  isDefault: boolean;
  hasPreview: boolean;
  templates: string[];
  music: string[];
  /** Nhạc theo loại video: thư mục nhac_nen_voice / nhac_nen_chill (other = bài thêm kiểu cũ) */
  musicCats?: { voice: string[]; chill: string[]; other: string[] };
  status: {
    python: boolean;
    fonts: boolean;
    /** Font phụ đề DT Phudu */
    phudu?: boolean;
    matteModel: boolean;
  };
  git: { commit: string; date: string; subject: string; remote: string } | null;
}

export interface SkillsResponse {
  defaultSkill: string | null;
  skills: Skill[];
}
