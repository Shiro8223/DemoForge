import { Camera, FileText, GitBranch, Rocket, ScanSearch, Sparkles, Clapperboard } from "lucide-react";
import { ImportForm } from "@/components/landing/import-form";
import { SystemStatus } from "@/components/landing/system-status";
import { RecentJobs } from "@/components/landing/recent-jobs";

const STEPS = [
  { icon: GitBranch, title: "Clone", body: "Your public repo lands in an isolated, throwaway workspace." },
  { icon: ScanSearch, title: "Understand", body: "Claude reads the code to find the framework, routes and real features." },
  { icon: Rocket, title: "Launch", body: "Dependencies install and the app boots in a sandbox." },
  { icon: Camera, title: "Capture", body: "Playwright screenshots the actual UI, desktop and mobile." },
  { icon: FileText, title: "Storyboard", body: "A grounded summary and a validated 9:16 storyboard." },
  { icon: Sparkles, title: "Generate", body: "Higgsfield renders cinematic hooks, transitions and outros." },
  { icon: Clapperboard, title: "Assemble", body: "FFmpeg cuts it all together with motion, type and music." },
];

export default function Home() {
  return (
    <main className="pb-24">
      <section className="mx-auto flex max-w-6xl flex-col items-center px-4 pt-20 text-center sm:px-6 sm:pt-28">
        <span className="mb-6 inline-flex items-center gap-2 rounded-full border border-violet-500/30 bg-violet-500/10 px-3 py-1 text-xs font-medium text-violet-200">
          <Sparkles className="size-3.5" /> GitHub repo → cinematic promo video
        </span>
        <h1 className="max-w-4xl font-display text-4xl leading-[1.05] font-bold tracking-tight sm:text-6xl md:text-7xl">
          You built it.
          <br />
          <span className="text-gradient">We&apos;ll make it impossible to ignore.</span>
        </h1>
        <p className="mt-6 max-w-2xl text-base text-muted sm:text-lg">
          Paste a repository. DemoForge launches your app, films the real UI, writes the story and cuts a 20–30 second vertical video
          ready for your demo, Devpost or socials.
        </p>
        <div className="mt-10 flex w-full justify-center">
          <ImportForm />
        </div>
        <div className="mt-6">
          <SystemStatus />
        </div>
      </section>

      <section className="mx-auto mt-24 max-w-6xl px-4 sm:px-6">
        <h2 className="mb-6 text-center font-display text-sm font-semibold uppercase tracking-[0.16em] text-muted">How it works</h2>
        <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s, i) => (
            <li key={s.title} className="relative rounded-2xl border border-line bg-panel/70 p-5">
              <div className="mb-3 flex items-center gap-3">
                <span className="grid size-9 place-items-center rounded-xl border border-line bg-panel-2 text-violet-300">
                  <s.icon className="size-4" />
                </span>
                <span className="font-mono text-xs text-muted">0{i + 1}</span>
              </div>
              <h3 className="font-display font-semibold">{s.title}</h3>
              <p className="mt-1 text-sm text-muted">{s.body}</p>
            </li>
          ))}
          <li className="flex flex-col justify-center rounded-2xl border border-dashed border-line p-5 text-sm text-muted">
            Real screenshots for real features. AI footage only where it can&apos;t misrepresent your product.
          </li>
        </ol>
      </section>

      <RecentJobs />
    </main>
  );
}
