import { UploadPanel } from "@/components/upload/UploadPanel";
import { SiteHeader } from "@/components/layout/SiteHeader";

export default function HomePage() {
  return (
    <div className="relative flex min-h-screen flex-col">
      {/* Glow nền */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-0 h-[480px] w-[880px] -translate-x-1/2 rounded-full bg-accent/[0.06] blur-[120px]"
      />

      <SiteHeader active="home" />

      <main className="relative z-10 mx-auto flex w-full max-w-4xl flex-1 flex-col items-center justify-center gap-10 px-4 pb-16 sm:px-6">
        <div className="space-y-3 text-center">
          <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
            GLT EDITOR. <span className="text-zinc-500">
            Biên tập video tự động.
            </span>
          </h1>
          <p className="text-sm text-zinc-500 sm:text-base">
            Thả video thô vào, nhận lại bản đã biên tập.
          </p>
        </div>

        <UploadPanel />
      </main>
    </div>
  );
}
