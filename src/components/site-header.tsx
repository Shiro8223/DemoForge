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
