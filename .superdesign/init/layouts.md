# DemoForge — Superdesign init

Stack: Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS v4 (CSS-first `@theme` in globals.css, no tailwind.config) via `@tailwindcss/postcss` · shadcn-style primitives built with class-variance-authority + clsx + tailwind-merge (`cn`) · `@radix-ui/react-slot` · lucide-react icons · local fonts (Inter Medium, Inter Display Bold, JetBrains Mono). Dark-only UI.

# Layouts

Single root layout: fixed background layer (`.glow` radial gradients + `.bg-grid` masked grid), sticky `SiteHeader`, then page content. No sidebar or footer.

## RootLayout
- Path: `src/app/layout.tsx`
- App shell: loads fonts, background glow/grid, SiteHeader, children.

```tsx
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
```

## SiteHeader
- Path: `src/components/site-header.tsx`
- Sticky blurred top bar: gradient clapperboard logo + 'DemoForge' wordmark (links to /), Settings ghost link.

```tsx
import Link from "next/link";
import { Clapperboard, Settings } from "lucide-react";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-20 border-b border-line/60 bg-bg/70 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2 font-display text-[15px] font-bold tracking-tight">
          <span className="grid size-7 place-items-center rounded-lg bg-gradient-to-br from-violet-500 to-cyan-400 text-white shadow-[0_0_20px_-4px_rgb(139_92_246/0.8)]">
            <Clapperboard className="size-4" />
          </span>
          DemoForge
        </Link>
        <Link href="/settings" className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm text-muted hover:bg-panel-2 hover:text-fg">
          <Settings className="size-4" /> Settings
        </Link>
      </div>
    </header>
  );
}
```
