import type { Metadata } from "next";
import { Be_Vietnam_Pro, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const sans = Be_Vietnam_Pro({
  subsets: ["latin", "vietnamese"],
  weight: ["300", "400", "500", "600"],
  variable: "--font-sans",
});
const mono = JetBrains_Mono({ subsets: ["latin", "vietnamese"], variable: "--font-mono" });

export const metadata: Metadata = {
  title: "GLT EDITOR — Auto Edit",
  description: "Tải video lên và để AI tự động biên tập.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi" className={`${sans.variable} ${mono.variable}`}>
      <body className="min-h-screen font-sans">{children}</body>
    </html>
  );
}
