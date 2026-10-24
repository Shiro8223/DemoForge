import type { Metadata } from "next";
import localFont from "next/font/local";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import "./globals.css";

const inter = localFont({ src: "../../assets/fonts/Inter-Medium.otf", variable: "--font-inter", weight: "500" });
const interDisplay = localFont({ src: "../../assets/fonts/InterDisplay-Bold.otf", variable: "--font-inter-display", weight: "700" });
// Movie-poster display face for headings: heavy, condensed, set in caps.
const anton = localFont({ src: "../../assets/fonts/Anton-Regular.ttf", variable: "--font-anton", weight: "400" });
const jetbrains = localFont({ src: "../../assets/fonts/JetBrainsMono-Regular.ttf", variable: "--font-jetbrains", weight: "400" });

export const metadata: Metadata = {
  title: "DemoForge — cinematic demos from your GitHub repo",
  description: "You built it. We'll make it impossible to ignore.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${interDisplay.variable} ${anton.variable} ${jetbrains.variable}`}>
      <body className="flex min-h-dvh flex-col">
        <SiteHeader />
        <div className="flex-1">{children}</div>
        <SiteFooter />
      </body>
    </html>
  );
}
