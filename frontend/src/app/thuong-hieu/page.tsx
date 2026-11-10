import type { Metadata } from "next";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { BrandManager } from "@/components/brand/BrandManager";

export const metadata: Metadata = {
  title: "Thương hiệu — video.ai",
  description: "Tên, SĐT, hashtag và đoạn kết CTA gắn vào cuối mọi video.",
};

export default function BrandPage() {
  return (
    <div className="relative flex min-h-screen flex-col">
      <SiteHeader active="brand" />
      <main className="relative z-10 mx-auto w-full max-w-4xl flex-1 space-y-8 px-4 pb-16 pt-6 sm:px-6">
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight">Thương hiệu</h1>
          <p className="text-sm text-zinc-500">Thiết lập 1 lần — mọi video, caption và đoạn kết đều theo.</p>
        </div>
        <BrandManager />
      </main>
    </div>
  );
}
