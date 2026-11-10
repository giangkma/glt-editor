import type { Metadata } from "next";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { SkillsManager } from "@/components/skills/SkillsManager";

export const metadata: Metadata = {
  title: "Skills — video.ai",
  description: "Lưu skill edit video để dùng cho mọi lần Auto-Edit.",
};

export default function SkillsPage() {
  return (
    <div className="relative flex min-h-screen flex-col">
      <SiteHeader active="skills" />
      <main className="relative z-10 mx-auto w-full max-w-4xl flex-1 space-y-8 px-4 pb-16 pt-6 sm:px-6">
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight">Skills</h1>
          <p className="text-sm text-zinc-500">
            Skill = bộ quy tắc + công cụ edit. Skill mặc định được dùng cho mọi video bạn tải lên.
          </p>
        </div>
        <SkillsManager />
      </main>
    </div>
  );
}
