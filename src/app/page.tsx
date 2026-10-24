import { Fragment } from "react";
import { ArrowRight, Brain, Camera, Film, GitBranch, LayoutTemplate, Rocket, Sparkles, Star } from "lucide-react";
import { ImportForm } from "@/components/landing/import-form";
import { RecentJobs } from "@/components/landing/recent-jobs";

const STEPS = [
  { icon: GitBranch, title: "Clone", body: "Your public repo lands in an isolated, throwaway workspace." },
  { icon: Brain, title: "Understand", body: "Gemini reads the code to find the framework, routes and real features." },
  { icon: Rocket, title: "Launch", body: "Dependencies install and the app boots in a sandbox." },
  { icon: Camera, title: "Capture", body: "Playwright screenshots the actual UI, desktop and mobile." },
  { icon: LayoutTemplate, title: "Storyboard", body: "A grounded summary and a validated 9:16 storyboard." },
  { icon: Sparkles, title: "Generate", body: "Higgsfield renders cinematic hooks, transitions and outros." },
  { icon: Film, title: "Assemble", body: "FFmpeg cuts it all together into final-demo.mp4." },
];

export default function Home() {
  return (
    <main>
      <section className="hero-glow">
        <div className="mx-auto max-w-6xl px-4 pt-20 pb-16 text-center sm:px-6">
          <p className="mb-8 flex flex-wrap items-center justify-center gap-x-2.5 gap-y-1 text-[13px] text-muted">
            {["Real screenshots", "AI cinematics", "zero editing"].map((t, i) => (
              <Fragment key={t}>
                {i > 0 && <Star aria-hidden className="size-3 fill-amber-400 text-amber-400" />}
                {t}
              </Fragment>
            ))}
          </p>
          <h1 className="mx-auto max-w-4xl font-display text-5xl leading-[0.95] sm:text-[88px]">
            Turn any GitHub repo into a
            <br className="hidden sm:block" /> <span className="text-gradient">cinematic product demo</span>
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-base leading-relaxed text-muted">
            Paste a public repository and get a 20–30s vertical promo video. We clone, understand, launch, capture real screens and assemble it —
            automatically.
          </p>
          <div id="import" className="mx-auto mt-10 max-w-xl scroll-mt-24">
            <ImportForm />
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <div className="mb-12 text-center">
          <p className="eyebrow mb-3">The pipeline</p>
          <h2 className="font-display text-[44px] leading-none">How it works</h2>
          <p className="mx-auto mt-3 max-w-lg text-[15px] text-muted">Seven automated stages from repository to a ready-to-post vertical video.</p>
        </div>
        <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s, i) => (
            <li
              key={s.title}
              className="group card-inset rounded-2xl border border-line bg-panel/80 p-5 transition-colors duration-150 hover:border-line-strong"
            >
              <div className="mb-4 flex items-center justify-between">
                <span className="grid size-10 place-items-center rounded-xl border border-line bg-panel-2 text-accent transition-transform duration-150 group-hover:scale-105">
                  <s.icon className="size-[18px]" />
                </span>
                <span className="font-mono text-xs text-muted">0{i + 1}</span>
              </div>
              <h3 className="mb-1.5 text-lg">{s.title}</h3>
              <p className="text-[13px] leading-relaxed text-muted">{s.body}</p>
            </li>
          ))}
          <li className="flex flex-col justify-center rounded-2xl border border-violet-500/30 bg-gradient-to-br from-violet-600/15 to-indigo-600/5 p-5">
            <h3 className="mb-1.5 text-lg">Ready to forge?</h3>
            <p className="mb-4 text-[13px] leading-relaxed text-muted">
              Real screenshots for real features. AI footage only where it can&apos;t misrepresent your product.
            </p>
            <a href="#import" className="inline-flex items-center gap-1.5 text-[13px] font-medium text-violet-300 transition-colors hover:text-violet-200">
              Start a demo <ArrowRight className="size-3.5" />
            </a>
          </li>
        </ol>
      </section>

      <RecentJobs />
    </main>
  );
}
