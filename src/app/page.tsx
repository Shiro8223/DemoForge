import { Fragment } from "react";
import { ArrowRight, Brain, Camera, Film, GitBranch, LayoutTemplate, Rocket, Sparkles, Star } from "lucide-react";
import { ImportForm } from "@/components/landing/import-form";
import { RecentJobs } from "@/components/landing/recent-jobs";
import { pop } from "@/lib/pop";
import { cn } from "@/lib/utils";

const STEPS = [
  { icon: GitBranch, title: "Clone", body: "Your public repo lands in an isolated, throwaway workspace." },
  { icon: Brain, title: "Understand", body: "Gemini reads the code to find the framework, routes and real features." },
  { icon: Rocket, title: "Launch", body: "Dependencies install and the app boots in a sandbox." },
  { icon: Camera, title: "Capture", body: "Playwright screenshots the actual UI, desktop and mobile." },
  { icon: LayoutTemplate, title: "Storyboard", body: "A grounded summary and a validated storyboard, vertical or widescreen." },
  { icon: Sparkles, title: "Generate", body: "Higgsfield renders cinematic hooks, transitions and outros." },
  { icon: Film, title: "Assemble", body: "FFmpeg cuts it all together into final-demo.mp4." },
];

export default function Home() {
  return (
    <main>
      <section className="relative border-b-3 border-black">
        <div className="bg-grid pointer-events-none absolute inset-0 -z-10" />
        <div className="mx-auto max-w-6xl px-4 pt-20 pb-20 text-center sm:px-6">
          <p className="mb-8 flex flex-wrap items-center justify-center gap-x-2.5 gap-y-1 text-[13px] font-bold text-black">
            {["Real screenshots", "AI cinematics", "zero editing"].map((t, i) => (
              <Fragment key={t}>
                {i > 0 && <Star aria-hidden className="size-4 fill-pop-yellow text-black" />}
                {t}
              </Fragment>
            ))}
          </p>
          <h1 className="mx-auto max-w-4xl font-display text-5xl leading-[0.95] sm:text-[88px]">
            Turn any GitHub repo into a
            <span className="mt-3 flex flex-wrap justify-center gap-x-3 gap-y-3 sm:mt-5">
              {["cinematic", "product", "demo"].map((w, i) => (
                <span key={w} className={cn("marker", pop(i * 2 + 1), i % 2 ? "rotate-1" : "-rotate-1")}>
                  {w}
                </span>
              ))}
            </span>
          </h1>
          <p className="mx-auto mt-8 max-w-xl text-base leading-relaxed font-medium text-fg">
            Paste a repository and get a promo video of up to 30 seconds, vertical or widescreen. We clone, understand, launch, capture real screens and assemble it
            automatically.
          </p>
          <div id="import" className="mx-auto mt-10 max-w-[632px] scroll-mt-24">
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
              className="group brutal-press rounded-2xl border-3 border-black bg-white p-5 shadow-brutal-sm"
            >
              <div className="mb-4 flex items-center justify-between">
                <span className={cn("grid size-11 place-items-center rounded-xl border-3 border-black text-black transition-transform duration-150 group-hover:-rotate-6", pop(i))}>
                  <s.icon className="size-5" />
                </span>
                <span className="font-display text-2xl text-black/25">0{i + 1}</span>
              </div>
              <h3 className="mb-1.5 text-lg">{s.title}</h3>
              <p className="text-[13px] leading-relaxed text-muted">{s.body}</p>
            </li>
          ))}
          <li className="flex flex-col justify-center rounded-2xl border-3 border-black bg-pop-yellow p-5 shadow-brutal-sm">
            <h3 className="mb-1.5 text-lg">Ready to forge?</h3>
            <p className="mb-4 text-[13px] leading-relaxed text-black">
              Real screenshots for real features. AI footage only where it can&apos;t misrepresent your product.
            </p>
            <a href="#import" className="brutal-press inline-flex w-fit items-center gap-1.5 rounded-lg border-2 border-black bg-white px-3 py-1.5 text-[13px] font-bold text-black">
              Start a demo <ArrowRight className="size-3.5" />
            </a>
          </li>
        </ol>
      </section>

      <RecentJobs />
    </main>
  );
}
