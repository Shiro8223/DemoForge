"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, Film, Loader2, Play, TriangleAlert, X } from "lucide-react";
import { pop } from "@/lib/pop";
import { cn } from "@/lib/utils";
import type { JobStatus } from "@/types";

type Row = { id: string; projectId: string; name: string; status: JobStatus; poster: string | null; createdAt: string };

const STATUS: Record<JobStatus, { label: string; cls: string }> = {
  completed: { label: "Done", cls: "bg-pop-green" },
  running: { label: "Running", cls: "bg-pop-blue" },
  pending: { label: "Queued", cls: "bg-white" },
  failed: { label: "Failed", cls: "bg-pop-red" },
};

function ago(iso: string) {
  const min = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return d === 1 ? "Yesterday" : `${d} days ago`;
}

export function useJobs(limit?: number) {
  const [rows, setRows] = useState<Row[] | null>(null);
  useEffect(() => {
    fetch(limit ? `/api/jobs?limit=${limit}` : "/api/jobs")
      .then((r) => r.json())
      .then(setRows)
      .catch(() => setRows([]));
  }, [limit]);
  return rows;
}

export function JobGrid({ rows }: { rows: Row[] }) {
  const [removed, setRemoved] = useState<Set<string>>(() => new Set());
  const [busy, setBusy] = useState<string | null>(null);

  async function remove(r: Row) {
    if (!confirm(`Clear "${r.name}"? Its video and files are deleted.`)) return;
    setBusy(r.id);
    const res = await fetch(`/api/jobs/${r.id}`, { method: "DELETE" }).catch(() => null);
    setBusy(null);
    if (res?.ok || res?.status === 404) setRemoved((s) => new Set(s).add(r.id));
    else alert((await res?.json().catch(() => null))?.error ?? "Couldn't clear this job.");
  }

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
      {rows.filter((r) => !removed.has(r.id)).map((r, i) => {
        const st = STATUS[r.status];
        const active = r.status === "running" || r.status === "pending";
        return (
          <div key={r.id} className="group relative">
            {r.status !== "running" && (
              <button
                type="button"
                aria-label={`Clear ${r.name}`}
                title="Clear job"
                disabled={busy === r.id}
                onClick={() => remove(r)}
                className="absolute top-2 right-2 z-10 grid size-6 place-items-center rounded-full border-2 border-black bg-white text-black shadow-brutal-sm transition hover:bg-pop-red disabled:opacity-50 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
              >
                {busy === r.id ? <Loader2 className="size-3 animate-spin" /> : <X className="size-3.5" strokeWidth={3} />}
              </button>
            )}
            <Link href={`/jobs/${r.id}`} className="block">
              <div
                className={cn(
                  "relative aspect-[9/16] overflow-hidden rounded-xl border-3 border-black bg-panel-2 shadow-brutal-sm transition duration-150 group-hover:-translate-x-0.5 group-hover:-translate-y-0.5 group-hover:shadow-brutal",
                  active && "shimmer",
                )}
              >
                {r.poster ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={`/api/jobs/${r.id}/files/${r.poster}`}
                    alt=""
                    className="absolute inset-0 size-full object-cover transition duration-500 group-hover:scale-105"
                  />
                ) : (
                  <div className={cn("absolute inset-0", r.status === "failed" ? "bg-pop-red/40" : pop(i))} />
                )}
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
                  {r.status === "completed" ? (
                    <span className="grid size-12 place-items-center rounded-full border-3 border-black bg-pop-yellow text-black shadow-brutal-sm transition-transform duration-150 group-hover:scale-110">
                      <Play className="ml-0.5 size-5 fill-black" />
                    </span>
                  ) : active ? (
                    <Loader2 className="size-7 animate-spin text-black" />
                  ) : r.status === "failed" ? (
                    <TriangleAlert className="size-7 text-black" />
                  ) : (
                    <Film className="size-7 text-black" />
                  )}
                </div>
                <span className={cn("absolute top-2 left-2 flex items-center gap-1 rounded-full border-2 border-black px-2 py-0.5 text-[10px] font-bold text-black", st.cls)}>
                  {r.status === "completed" ? <Check className="size-3" /> : r.status === "failed" ? <X className="size-3" /> : <span className="size-1 rounded-full bg-current" />}
                  {st.label}
                </span>
              </div>
              <p className="mt-3 truncate text-[13px] font-bold text-fg">{r.name}</p>
              <p className="truncate font-mono text-[11px] text-muted">
                {r.projectId} · {ago(r.createdAt)}
              </p>
            </Link>
          </div>
        );
      })}
    </div>
  );
}

export function RecentJobs() {
  const rows = useJobs();
  if (!rows?.length) return null;
  return (
    <section id="recent" className="mx-auto max-w-6xl scroll-mt-20 px-4 pb-24 sm:px-6">
      <div className="mb-8 flex items-end justify-between gap-4">
        <div>
          <p className="eyebrow mb-3">Gallery</p>
          <h2 className="font-display text-[44px] leading-none">Recent jobs</h2>
        </div>
        <Link href="/jobs" className="brutal-press inline-flex items-center gap-1.5 rounded-lg border-2 border-black bg-pop-green px-3 py-1.5 text-[13px] font-bold text-black shadow-brutal-sm">
          View all <ArrowRight className="size-3.5" />
        </Link>
      </div>
      <JobGrid rows={rows} />
    </section>
  );
}
