"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, Film, Loader2, Play, TriangleAlert, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { JobStatus } from "@/types";

type Row = { id: string; projectId: string; name: string; status: JobStatus; poster: string | null; createdAt: string };

const STATUS: Record<JobStatus, { label: string; cls: string }> = {
  completed: { label: "Done", cls: "border-emerald-500/30 bg-emerald-500/20 text-emerald-300" },
  running: { label: "Running", cls: "border-violet-500/30 bg-violet-500/20 text-violet-300" },
  pending: { label: "Queued", cls: "border-line bg-black/40 text-muted" },
  failed: { label: "Failed", cls: "border-red-500/30 bg-red-500/20 text-red-300" },
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
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
      {rows.map((r) => {
        const st = STATUS[r.status];
        const active = r.status === "running" || r.status === "pending";
        return (
          <Link key={r.id} href={`/jobs/${r.id}`} className="group block">
            <div
              className={cn(
                "relative aspect-[9/16] overflow-hidden rounded-xl border border-line bg-panel-2 transition-colors duration-150 group-hover:border-line-strong",
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
                <div
                  className={cn(
                    "absolute inset-0 bg-gradient-to-br via-panel-2",
                    r.status === "failed" ? "from-red-900/30 to-panel" : "from-violet-600/25 to-cyan-500/15",
                  )}
                />
              )}
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
                {r.status === "completed" ? (
                  <span className="grid size-11 place-items-center rounded-full border border-white/10 bg-black/40 text-white backdrop-blur transition-transform duration-150 group-hover:scale-110">
                    <Play className="ml-0.5 size-[18px]" />
                  </span>
                ) : active ? (
                  <Loader2 className="size-6 animate-spin text-violet-300" />
                ) : r.status === "failed" ? (
                  <TriangleAlert className="size-6 text-red-400/70" />
                ) : (
                  <Film className="size-6 text-muted" />
                )}
              </div>
              <span className={cn("absolute top-2 left-2 flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium", st.cls)}>
                {r.status === "completed" ? <Check className="size-3" /> : r.status === "failed" ? <X className="size-3" /> : <span className="size-1 rounded-full bg-current" />}
                {st.label}
              </span>
            </div>
            <p className="mt-2 truncate text-[13px] font-medium text-fg">{r.name}</p>
            <p className="truncate font-mono text-[11px] text-muted">
              {r.projectId} · {ago(r.createdAt)}
            </p>
          </Link>
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
        <Link href="/jobs" className="inline-flex items-center gap-1.5 text-[13px] font-medium text-violet-300 transition-colors hover:text-violet-200">
          View all <ArrowRight className="size-3.5" />
        </Link>
      </div>
      <JobGrid rows={rows} />
    </section>
  );
}
