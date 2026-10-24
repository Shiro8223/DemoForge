"use client";

import Link from "next/link";
import { Film, Loader2, Plus } from "lucide-react";
import { JobGrid, useJobs } from "@/components/landing/recent-jobs";

export function AllJobs() {
  const rows = useJobs(200);
  if (!rows) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="size-6 animate-spin text-violet-300" />
      </div>
    );
  }
  if (!rows.length) {
    return (
      <div className="card-inset flex flex-col items-center rounded-2xl border border-line bg-panel/80 px-6 py-16 text-center">
        <span className="mb-4 grid size-11 place-items-center rounded-xl border border-line bg-panel-2 text-accent">
          <Film className="size-[18px]" />
        </span>
        <h2 className="text-[15px] font-semibold">No jobs yet</h2>
        <p className="mt-1.5 mb-6 text-[13px] text-muted">Paste a GitHub repo to generate your first demo.</p>
        <Link
          href="/#import"
          className="flex h-10 items-center gap-1.5 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 px-4 text-sm font-medium text-white shadow-[0_0_0_1px_rgb(255_255_255/0.08)_inset,0_8px_24px_-8px_rgb(139_92_246/0.6)] hover:brightness-110"
        >
          <Plus className="size-4" /> New demo
        </Link>
      </div>
    );
  }
  return <JobGrid rows={rows} />;
}
