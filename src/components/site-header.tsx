"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Plus } from "lucide-react";
import { LogoMark, REPO_URL } from "@/components/brand";
import { HeaderGitHub } from "@/components/github-account";
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
    <header className="sticky top-0 z-40 border-b-3 border-black bg-white">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5 text-lg font-extrabold tracking-tight">
          <LogoMark />
          DemoForge
        </Link>
        <nav className="hidden items-center gap-1 text-sm md:flex">
          {NAV.map((n) => {
            const active = !n.external && n.match?.(pathname);
            const cls = cn(
              "rounded-lg border-2 px-3 py-1 font-bold transition-colors duration-150",
              active ? "border-black bg-pop-cyan text-black shadow-brutal-sm" : "border-transparent text-black hover:border-black hover:bg-pop-yellow",
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
          <HeaderGitHub />
          <Link
            href="/#import"
            className="brutal-press flex h-9 items-center gap-1.5 rounded-lg border-2 border-black bg-pop-pink px-3.5 text-[13px] font-bold text-black shadow-brutal-sm"
          >
            <Plus className="size-3.5" /> New demo
          </Link>
        </div>
      </div>
    </header>
  );
}
