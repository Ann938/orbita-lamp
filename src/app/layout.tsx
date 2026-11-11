import type { Metadata, Viewport } from "next";
import { Cormorant_Garamond, Manrope } from "next/font/google";
import { site } from "@/content";
import "@/styles/globals.scss";

// Заголовки — антиква Cormorant (ощущение дорогого предмета), интерфейс — Manrope.
// (Гротеск Inter Tight пробовали — вернулись к антикве.)
const display = Cormorant_Garamond({
  variable: "--font-display",
  subsets: ["latin", "cyrillic"],
  weight: ["500", "600"],
  style: ["normal", "italic"],
});
const sans = Manrope({
  variable: "--font-sans",
  subsets: ["latin", "cyrillic"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  // опубликованный концепт не должен попадать в поиск
  robots: process.env.PAGES_EXPORT === "1" ? { index: false, follow: false } : undefined,
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_ORIGIN || "http://localhost:3300"),
  title: site.title,
  description: site.description,
  icons: { icon: `${process.env.NEXT_PUBLIC_BASE_PATH || ""}/favicon.svg` },
  openGraph: { title: site.title, description: site.description, type: "website", locale: "ru_RU" },
};

export const viewport: Viewport = {
  themeColor: "#07060b",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ru" className={`${display.variable} ${sans.variable}`}>
      <body>{children}</body>
    </html>
  );
}
