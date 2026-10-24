"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Plus } from "lucide-react";
import { GithubIcon, LogoMark, REPO_URL } from "@/components/brand";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/", label: "Dashboard", match: (p: string) => p === "/" },
  { href: "/jobs", label: "Jobs", match: (p: string) => p.startsWith("/jobs") },
  { href: `${REPO_URL}#readme`, label: "Docs", external: true },
  { href: "/settings", label: "Settings", match: (p: string) => p.startsWith("/settings") },
];

export function SiteHeader() {
  const pathname = usePathname();
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-bg/70 backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5 text-[15px] font-semibold tracking-tight">
          <LogoMark />
          DemoForge
        </Link>
        <nav className="hidden items-center gap-1 text-sm md:flex">
          {NAV.map((n) => {
            const active = !n.external && n.match?.(pathname);
            const cls = cn(
              "rounded-lg px-3 py-1.5 transition-colors duration-150",
              active ? "bg-panel-2 text-fg" : "text-muted hover:bg-panel-2 hover:text-fg",
            );
            return n.external ? (
              <a key={n.label} href={n.href} target="_blank" rel="noreferrer" className={cls}>
                {n.label}
              </a>
            ) : (
              <Link key={n.label} href={n.href} className={cls}>
                {n.label}
              </Link>
            );
          })}
        </nav>
        <div className="flex items-center gap-2">
          <a
            href={REPO_URL}
            target="_blank"
            rel="noreferrer"
            aria-label="DemoForge on GitHub"
            className="hidden h-8 items-center rounded-lg border border-line px-2.5 text-muted transition-colors duration-150 hover:border-line-strong hover:text-fg sm:flex"
          >
            <GithubIcon />
          </a>
          <Link
            href="/#import"
            className="flex h-8 items-center gap-1.5 rounded-lg bg-gradient-to-r from-violet-600 to-indigo-600 px-3.5 text-[13px] font-medium text-white shadow-[0_0_0_1px_rgb(255_255_255/0.08)_inset,0_8px_24px_-8px_rgb(139_92_246/0.6)] hover:brightness-110"
          >
            <Plus className="size-3.5" /> New demo
          </Link>
        </div>
      </div>
    </header>
  );
}
