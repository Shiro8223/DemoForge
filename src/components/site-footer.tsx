import Link from "next/link";
import { LogoMark, REPO_URL } from "@/components/brand";

export function SiteFooter() {
  return (
    <footer className="border-t-3 border-black bg-pop-yellow">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 py-8 sm:flex-row sm:px-6">
        <div className="flex items-center gap-2.5 text-[13px] font-bold text-black">
          <LogoMark size="sm" />
          <span>DemoForge</span>
          <span className="hidden font-medium sm:inline">· Powered by Gemini, Higgsfield &amp; FFmpeg</span>
        </div>
        <div className="flex items-center gap-5 text-[13px] font-bold text-black">
          <a href={`${REPO_URL}#readme`} target="_blank" rel="noreferrer" className="underline-offset-4 hover:underline">Docs</a>
          <a href={REPO_URL} target="_blank" rel="noreferrer" className="underline-offset-4 hover:underline">GitHub</a>
          <Link href="/settings" className="underline-offset-4 hover:underline">Settings</Link>
        </div>
      </div>
    </footer>
  );
}
