import type { Metadata } from "next";
import localFont from "next/font/local";
import { SiteHeader } from "@/components/site-header";
import "./globals.css";

const inter = localFont({ src: "../../assets/fonts/Inter-Medium.otf", variable: "--font-inter", weight: "500" });
const interDisplay = localFont({ src: "../../assets/fonts/InterDisplay-Bold.otf", variable: "--font-inter-display", weight: "700" });
const jetbrains = localFont({ src: "../../assets/fonts/JetBrainsMono-Regular.ttf", variable: "--font-jetbrains", weight: "400" });

export const metadata: Metadata = {
  title: "DemoForge — cinematic demos from your GitHub repo",
  description: "You built it. We'll make it impossible to ignore.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${interDisplay.variable} ${jetbrains.variable}`}>
      <body className="min-h-dvh">
        <div className="pointer-events-none fixed inset-0 -z-10">
          <div className="glow absolute inset-0" />
          <div className="bg-grid absolute inset-0" />
        </div>
        <SiteHeader />
        {children}
      </body>
    </html>
  );
}
