import Link from "next/link";
import { LogoMark, REPO_URL } from "@/components/brand";

export function SiteFooter() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 py-8 sm:flex-row sm:px-6">
        <div className="flex items-center gap-2.5 text-[13px] text-muted">
          <LogoMark size="sm" />
          <span>DemoForge</span>
          <span className="hidden text-muted/60 sm:inline">· Powered by Claude, Higgsfield &amp; FFmpeg</span>
        </div>
        <div className="flex items-center gap-5 text-[13px] text-muted">
          <a href={`${REPO_URL}#readme`} target="_blank" rel="noreferrer" className="transition-colors hover:text-fg">Docs</a>
          <a href={REPO_URL} target="_blank" rel="noreferrer" className="transition-colors hover:text-fg">GitHub</a>
          <Link href="/settings" className="transition-colors hover:text-fg">Settings</Link>
        </div>
      </div>
    </footer>
  );
}
