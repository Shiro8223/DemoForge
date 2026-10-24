"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AlertTriangle, ArrowLeft, Download, ExternalLink, Info, Loader2, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StageList } from "./stage-list";
import { StatusDot } from "./status-dot";
import { SceneCard } from "@/components/storyboard/scene-card";
import { Markdown } from "@/components/storyboard/markdown";
import type { Job } from "@/types";

export function JobView({ jobId }: { jobId: string }) {
  const router = useRouter();
  const [job, setJob] = useState<Job | null>(null);
  const [missing, setMissing] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);
  const [higgsfield, setHiggsfield] = useState(false);
  const [workerUp, setWorkerUp] = useState(true);
  const [regenBusy, setRegenBusy] = useState(false);

  const load = useCallback(
    () =>
      fetch(`/api/jobs/${jobId}`, { cache: "no-store" })
        .then(async (res) => {
          if (res.status === 404) setMissing(true);
          else if (res.ok) setJob(await res.json());
        })
        .catch(() => {}),
    [jobId],
  );

  const active = !job || job.status === "pending" || job.status === "running";
  useEffect(() => {
    const first = setTimeout(load, 0);
    const t = active ? setInterval(load, 2000) : undefined;
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [load, active]);

  useEffect(() => {
    fetch("/api/health").then((r) => r.json()).then((h) => {
      setHiggsfield(h.higgsfield);
      setWorkerUp(h.worker);
    }).catch(() => {});
  }, [active]);

  const summaryPath = job?.outputs.summary;
  useEffect(() => {
    if (!summaryPath) return;
    fetch(`/api/jobs/${jobId}/files/${summaryPath}?v=${job?.updatedAt}`).then((r) => r.text()).then(setSummary).catch(() => {});
    // Only refetch when the summary first appears.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId, summaryPath]);

  async function regenerate() {
    setRegenBusy(true);
    const res = await fetch(`/api/jobs/${jobId}/regenerate`, { method: "POST" });
    const data = await res.json();
    if (res.ok) router.push(`/jobs/${data.jobId}`);
    else setRegenBusy(false);
  }

  if (missing)
    return (
      <div className="mx-auto max-w-xl px-4 py-24 text-center">
        <p className="font-display text-2xl font-bold">Job not found</p>
        <Button asChild variant="secondary" className="mt-6"><Link href="/">Back home</Link></Button>
      </div>
    );
  if (!job)
    return (
      <div className="grid min-h-[60vh] place-items-center text-muted">
        <Loader2 className="size-6 animate-spin" />
      </div>
    );

  const a = job.outputs.analysis;
  const sb = job.outputs.storyboard;
  const shots = job.outputs.screenshots ?? [];
  const file = (rel: string) => `/api/jobs/${job.id}/files/${rel}`;
  const v = encodeURIComponent(job.updatedAt);
  const hasVideo = !!job.outputs.video && job.stages.find((s) => s.id === "assemble")?.status === "completed";

  return (
    <main className="mx-auto max-w-6xl px-4 pt-8 pb-24 sm:px-6">
      <Link href="/" className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg">
        <ArrowLeft className="size-4" /> New demo
      </Link>

      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <div className="mb-2 flex items-center gap-2">
            <StatusDot status={job.status} />
            <Badge variant={job.status === "completed" ? "success" : job.status === "failed" ? "danger" : "accent"}>
              {job.status === "pending" ? "queued" : job.status}
            </Badge>
            {job.outputs.authoredBy && (
              <Badge>{job.outputs.authoredBy === "claude" ? "Storyboard by Claude" : "Template storyboard"}</Badge>
            )}
          </div>
          <h1 className="truncate font-display text-3xl font-bold tracking-tight sm:text-4xl">{a?.name ?? job.repo}</h1>
          <a href={job.repoUrl} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 font-mono text-sm text-muted hover:text-fg">
            {job.projectId} <ExternalLink className="size-3.5" />
          </a>
        </div>
        {!active && (
          <div className="flex flex-wrap gap-2">
            {hasVideo && (
              <Button asChild>
                <a href={`${file(job.outputs.video!)}?download=1`}>
                  <Download /> Download MP4
                </a>
              </Button>
            )}
            <Button variant="secondary" onClick={regenerate} disabled={regenBusy}>
              {regenBusy ? <Loader2 className="animate-spin" /> : <RefreshCw />} Regenerate
            </Button>
          </div>
        )}
      </div>

      {active && !workerUp && (
        <div className="mb-6 flex items-start gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-100">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <p>No generation worker is running, so this job is waiting in the queue. Start one with <code className="font-mono">npm run worker</code>.</p>
        </div>
      )}

      {job.status === "failed" && job.error && (
        <div className="mb-6 flex items-start gap-3 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-100">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <div className="min-w-0">
            <p className="font-medium">Generation failed</p>
            <p className="mt-1 font-mono text-xs whitespace-pre-wrap text-red-200/80">{job.error}</p>
          </div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
        {/* Left: video or pipeline */}
        <div className="space-y-6">
          {hasVideo ? (
            <div className="overflow-hidden rounded-3xl border border-line bg-black shadow-[0_30px_80px_-30px_rgb(139_92_246/0.6)]">
              <video
                key={v}
                src={`${file(job.outputs.video!)}?v=${v}`}
                poster={job.outputs.poster ? `${file(job.outputs.poster)}?v=${v}` : undefined}
                controls
                playsInline
                className="aspect-[9/16] w-full bg-black"
              />
            </div>
          ) : (
            <div className="relative grid aspect-[9/16] place-items-center overflow-hidden rounded-3xl border border-line bg-panel">
              {shots[0] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={file(shots[0].mobile)} alt="" className="absolute inset-0 size-full object-cover object-top opacity-25 blur-sm" />
              ) : null}
              <div className="relative text-center">
                {active ? <Loader2 className="mx-auto size-8 animate-spin text-violet-300" /> : <AlertTriangle className="mx-auto size-8 text-muted" />}
                <p className="mt-3 text-sm text-muted">{active ? "Your demo is being forged…" : "No video produced"}</p>
              </div>
            </div>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Pipeline</CardTitle>
              <CardDescription>Live status of each stage. Nothing here is simulated.</CardDescription>
            </CardHeader>
            <CardContent>
              <StageList stages={job.stages} />
            </CardContent>
          </Card>
        </div>

        {/* Right: details */}
        <div className="min-w-0 space-y-6">
          {job.notices.length > 0 && (
            <Card className="border-amber-500/20">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-amber-200"><Info className="size-4" /> Heads up</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-1.5 text-sm text-fg/80">
                  {job.notices.map((n, i) => <li key={i} className="break-words">• {n}</li>)}
                </ul>
              </CardContent>
            </Card>
          )}

          {a && (
            <Card>
              <CardHeader>
                <CardTitle>Project</CardTitle>
                <CardDescription>{a.description || "No description found."}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 text-sm">
                <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {[
                    ["Framework", a.framework],
                    ["Package manager", a.packageManager],
                    ["Start", a.startScript ? `${a.packageManager} run ${a.startScript}` : a.runKind],
                    ["Analysed by", a.analysedBy === "claude" ? "Claude" : "Static analysis"],
                  ].map(([k, val]) => (
                    <div key={k} className="rounded-xl border border-line bg-panel-2 p-3">
                      <dt className="text-[11px] tracking-wide text-muted uppercase">{k}</dt>
                      <dd className="mt-1 truncate font-mono text-xs">{val}</dd>
                    </div>
                  ))}
                </dl>
                {a.features.length > 0 && (
                  <div>
                    <p className="mb-1.5 text-xs tracking-wide text-muted uppercase">Features (from repo evidence)</p>
                    <ul className="space-y-1">{a.features.map((f, i) => <li key={i}>• {f}</li>)}</ul>
                  </div>
                )}
                <div className="flex flex-wrap gap-1.5">
                  {a.routes.map((r) => <code key={r} className="rounded-md border border-line bg-panel-2 px-2 py-0.5 font-mono text-xs">{r}</code>)}
                </div>
              </CardContent>
            </Card>
          )}

          {sb && (
            <Card>
              <CardHeader>
                <CardTitle>Storyboard</CardTitle>
                <CardDescription>
                  {sb.scenes.length} scenes · {sb.duration}s · {sb.aspectRatio} · {sb.visualStyle}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {sb.scenes.map((s, i) => (
                  <SceneCard
                    key={`${s.id}-${job.updatedAt}`}
                    jobId={job.id}
                    scene={s}
                    index={i}
                    generated={job.outputs.generatedScenes?.find((g) => g.sceneId === s.id)}
                    editable={!active}
                    higgsfield={higgsfield}
                    onQueued={load}
                  />
                ))}
              </CardContent>
            </Card>
          )}

          {shots.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Captured screenshots</CardTitle>
                <CardDescription>Real renders of the running app via Playwright.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-2">
                {shots.map((s) => (
                  <a key={s.route} href={file(s.desktop)} target="_blank" rel="noreferrer" className="group overflow-hidden rounded-xl border border-line bg-panel-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={file(s.desktop)} alt={s.title} className="aspect-[16/10] w-full object-cover object-top transition group-hover:opacity-90" />
                    <div className="flex items-center justify-between gap-2 px-3 py-2">
                      <span className="truncate text-xs">{s.title}</span>
                      <code className="font-mono text-[11px] text-muted">{s.route}</code>
                    </div>
                  </a>
                ))}
              </CardContent>
            </Card>
          )}

          {summary && (
            <Card>
              <CardHeader className="flex-row items-center justify-between">
                <CardTitle>summary.md</CardTitle>
                <a href={`${file("summary.md")}?download=1`} className="text-xs text-muted hover:text-fg">Download</a>
              </CardHeader>
              <CardContent>
                <Markdown source={summary} />
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </main>
  );
}
