import Link from "next/link";
import { MOCK_UPLOAD } from "@/lib/config";

export function SiteHeader({ active }: { active: "home" | "skills" | "brand" }) {
  const link = (href: string, label: string, on: boolean) => (
    <Link
      href={href}
      className={["rounded-full px-3 py-1.5 text-xs transition-colors", on ? "bg-white/10 text-zinc-100" : "text-zinc-500 hover:text-zinc-200"].join(" ")}
    >
      {label}
    </Link>
  );

  return (
    <header className="relative z-10 flex items-center justify-between px-6 py-5 sm:px-10">
      <Link href="/" className="flex items-center gap-2.5">
        <span className="h-2.5 w-2.5 rounded-full bg-accent shadow-[0_0_12px_rgba(198,255,61,0.8)]" />
        <span className="text-sm font-medium tracking-tight">
          gianglangthang.vn
        </span>
      </Link>
      <nav className="flex items-center gap-1">
        {MOCK_UPLOAD && (
          <span
            title="NEXT_PUBLIC_MOCK_UPLOAD=true trong frontend/.env.local — video không được gửi lên backend"
            className="mr-2 rounded-full bg-amber-400 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-ink-950"
          >
            Chế độ giả lập
          </span>
        )}
        {link("/", "Edit", active === "home")}
        {link("/thuong-hieu", "Thương hiệu", active === "brand")}
        {link("/skills", "Skills", active === "skills")}
      </nav>
    </header>
  );
}
