import { Suspense } from "react";
import { Box, Info, Plug, Sparkles, TriangleAlert } from "lucide-react";
import { GithubIcon } from "@/components/brand";
import { GitHubSettings } from "@/components/github-account";
import { HiggsfieldSettings } from "@/components/settings/higgsfield-settings";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { config } from "@/lib/config";

export const dynamic = "force-dynamic";

const SECTIONS = [
  { id: "integrations", label: "Integrations", icon: Plug },
  { id: "github", label: "GitHub", icon: GithubIcon },
  { id: "generation", label: "Generation", icon: Sparkles },
  { id: "sandbox", label: "Sandbox", icon: Box },
  { id: "danger", label: "Danger zone", icon: Info },
];

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border-2 border-black bg-panel-2 px-3.5 py-2.5">
      <p className="text-[11px] tracking-wide text-muted uppercase">{label}</p>
      <p className="mt-1 font-mono text-[13px] text-fg">{value}</p>
    </div>
  );
}

export default function SettingsPage() {
  const gemini = !!config.gemini.apiKey;
  return (
    <main className="mx-auto max-w-5xl px-4 pt-10 pb-24 sm:px-6">
      <div className="mb-10">
        <h1 className="font-display text-[44px] leading-none">Settings</h1>
        <p className="mt-2 text-[15px] text-muted">Keys stay on the server — never sent to the browser or to repository processes.</p>
      </div>
      <div className="grid gap-8 lg:grid-cols-[200px_minmax(0,1fr)]">
        <nav className="flex flex-wrap gap-1 text-sm lg:sticky lg:top-20 lg:flex-col lg:self-start">
          {SECTIONS.map((s, i) => (
            <a
              key={s.id}
              href={`#${s.id}`}
              className={cn(
                "flex items-center gap-2.5 rounded-lg border px-3 py-2 transition-colors duration-150",
                i === 0 ? "border-black bg-pop-cyan font-bold text-black shadow-brutal-sm" : "border-transparent font-bold text-black hover:border-black hover:bg-pop-yellow",
              )}
            >
              <s.icon className="size-4" /> {s.label}
            </a>
          ))}
        </nav>

        <div className="max-w-[720px] space-y-6">
          <HiggsfieldSettings maxScenes={config.higgsfield.maxScenes}>
            <Suspense>
              <GitHubSettings />
            </Suspense>

            <section id="generation" className="scroll-mt-20 rounded-2xl border-3 border-black bg-white shadow-brutal p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-xl">Gemini</h2>
                <Badge variant={gemini ? "success" : "warning"}>
                  <span className={cn("size-1.5 rounded-full", "bg-black")} />
                  {gemini ? "Configured via GEMINI_API_KEY" : "Not configured"}
                </Badge>
              </div>
              <p className="mt-4 text-sm leading-relaxed text-muted">Reads the repository to ground the analysis, then writes summary.md and the storyboard.</p>
              <div className="mt-4 flex flex-wrap gap-3">
                <Field label="Model" value={config.gemini.model} />
                {config.gemini.fallbackModel && <Field label="Fallback model" value={config.gemini.fallbackModel} />}
              </div>
              <p className="mt-4 text-[13px] leading-relaxed text-muted">
                Set <code className="font-mono text-fg">GEMINI_API_KEY</code> in <code className="font-mono text-fg">.env</code> on the server. Without
                it, DemoForge uses deterministic templates built from static analysis, and the output is labelled as a template storyboard.
              </p>
            </section>

            <section id="sandbox" className="scroll-mt-20 rounded-2xl border-3 border-black bg-white shadow-brutal p-5">
              <h2 className="text-xl">Sandbox mode</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted">Repositories are untrusted code. This controls how installs and launches are isolated.</p>
              <div className="mt-4 inline-flex rounded-xl border-2 border-black bg-panel p-1" role="radiogroup" aria-label="Sandbox mode (read-only)">
                {(["local", "docker"] as const).map((m) => (
                  <span
                    key={m}
                    role="radio"
                    aria-checked={config.sandbox === m}
                    className={cn(
                      "flex h-9 items-center rounded-lg border px-4 text-[13px] font-medium capitalize",
                      config.sandbox === m ? "border-black bg-pop-green font-bold text-black" : "border-transparent text-muted",
                    )}
                  >
                    {m}
                  </span>
                ))}
              </div>
              <p className="mt-2 text-xs text-muted">
                Change it with <code className="font-mono text-fg">DEMOFORGE_SANDBOX=local|docker</code> in <code className="font-mono text-fg">.env</code>.
              </p>
              {config.sandbox === "docker" && (
                <div className="mt-4 flex">
                  <Field label="Docker image" value={config.dockerImage} />
                </div>
              )}
              {config.sandbox === "local" && (
                <div className="mt-4 flex items-start gap-3 rounded-xl border-3 border-black bg-pop-yellow p-3.5 text-[13px] text-black">
                  <TriangleAlert className="mt-0.5 size-4 shrink-0 text-black" />
                  <p>
                    Local mode runs repository code directly on this machine with a scrubbed environment, a throwaway HOME and timeouts. It is fine for
                    your own repos but is <span className="font-medium">not a security boundary</span>.
                  </p>
                </div>
              )}
            </section>
          </HiggsfieldSettings>
        </div>
      </div>
    </main>
  );
}
