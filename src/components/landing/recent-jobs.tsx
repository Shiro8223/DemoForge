"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Film } from "lucide-react";
import { StatusDot } from "@/components/generation/status-dot";
import type { JobStatus } from "@/types";

type Row = { id: string; projectId: string; name: string; status: JobStatus; poster: string | null; createdAt: string };

export function RecentJobs() {
  const [rows, setRows] = useState<Row[]>([]);
  useEffect(() => {
    fetch("/api/jobs").then((r) => r.json()).then(setRows).catch(() => {});
  }, []);
  if (!rows.length) return null;
  return (
    <section className="mx-auto mt-24 max-w-6xl px-4 sm:px-6">
      <h2 className="mb-4 font-display text-sm font-semibold uppercase tracking-[0.16em] text-muted">Recent demos</h2>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        {rows.map((r) => (
          <Link key={r.id} href={`/jobs/${r.id}`} className="group overflow-hidden rounded-2xl border border-line bg-panel transition hover:border-violet-500/40">
            <div className="relative aspect-[9/16] bg-panel-2">
              {r.poster ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={`/api/jobs/${r.id}/files/${r.poster}`} alt="" className="size-full object-cover transition duration-500 group-hover:scale-105" />
              ) : (
                <div className="grid size-full place-items-center text-muted">
                  <Film className="size-6" />
                </div>
              )}
            </div>
            <div className="flex items-center gap-2 p-3">
              <StatusDot status={r.status} />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{r.name}</p>
                <p className="truncate font-mono text-[11px] text-muted">{r.projectId}</p>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
